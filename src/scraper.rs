use crate::{
    log,
    logger::{LogStyle, log_msg},
    parser::{VOIVODESHIP_COUNT, Voivodeship},
    paths::Paths,
    utils::{AppResult, ensure_exists, format_file_name, format_file_name_parts},
};
use regex::Regex;
use std::{
    collections::{HashMap, HashSet},
    fs::{DirEntry, read_dir},
    io,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
    time,
};
use tokio::task::JoinSet;

const CONCURRENT_DOWNLOADS: usize = 5;

pub struct Links {
    pub coa_link: String,
    pub bg_link: String,
}

fn file_stem(entry: &DirEntry) -> Option<String> {
    Some(
        Path::new(&entry.file_name())
            .file_stem()
            .unwrap()
            .to_str()?
            .to_owned(),
    )
}

fn log_try_page(positive: bool, prefix: &str, reason: &str, city_link: String) {
    let color = if positive {
        LogStyle::Green
    } else {
        LogStyle::Yellow
    };
    log!(
        [color],
        prefix,
        "{}{reason:20}{} {}{color}\u{2022}{} {}.../wiki/{city_link}{}",
        LogStyle::Italic,
        LogStyle::Clear,
        LogStyle::Bold,
        LogStyle::Clear,
        LogStyle::Cyan,
        LogStyle::Clear,
    )
}

async fn try_page<const N: usize, const M: usize>(
    city_name: String,
    city_identifier: String,
    suffixes: [String; N],
    regexes: Arc<[(Regex, Regex); M]>,
    replacement_regex: Arc<Regex>,
    client: reqwest::Client,
    counter: Arc<AtomicU32>,
    total: usize,
) -> Option<(String, Links)> {
    for (coa_regex, bg_regex) in regexes.iter() {
        for suffix in &suffixes {
            let city_link = format!("{}{}", city_name, suffix).replace(" ", "_");
            let url = format!("https://pl.wikipedia.org/wiki/{city_link}");

            let response = client.get(url).send().await.ok()?;

            if let Err(error) = response.error_for_status_ref() {
                log_try_page(
                    false,
                    "FAIL",
                    &format!(
                        "{} {}",
                        error.status().unwrap().as_u16(),
                        error.status().unwrap().canonical_reason().unwrap()
                    ),
                    city_link,
                );
                continue;
            }

            let text = response.text().await.ok()?;
            let Some(coa_captures) = coa_regex.captures(&text) else {
                log_try_page(false, "NO MATCH", "no COA", city_link);
                continue;
            };

            let Some(bg_captures) = bg_regex.captures(&text) else {
                log_try_page(false, "NO MATCH", "no background", city_link);
                continue;
            };

            let bg_cap = bg_captures.get(1).unwrap().as_str().replace("/thumb", "");

            let coa_link = "https:".to_owned() + coa_captures.get(1).unwrap().as_str();
            let bg_link = "https:".to_owned() + &replacement_regex.replace(&bg_cap, "");

            if coa_link == bg_link {
                log!([LogStyle::Yellow], "NO MATCH", ".../wiki/{city_link}",);
                continue;
            };

            log_try_page(
                true,
                &format!(
                    "HIT{:>12}",
                    format!("{}/{total}", counter.fetch_add(1, Ordering::Relaxed) + 1)
                ),
                "COA OK, BG OK",
                city_link,
            );

            return Some((
                format_file_name_parts(&city_identifier, &city_name),
                Links { coa_link, bg_link },
            ));
        }
    }

    log!(
        [LogStyle::Red],
        "PARSER ERR",
        "No image found for city {city_name}.",
    );

    None
}

pub async fn get_links(
    paths: &Paths,
    dataset: &[Voivodeship; VOIVODESHIP_COUNT],
) -> AppResult<(time::Duration, Vec<(String, Links)>)> {
    ensure_exists(&paths.coa)?;
    ensure_exists(&paths.backgrounds)?;

    let start_time = time::Instant::now();

    log!([LogStyle::Blue], "SCRAPER", "Checking for existing entries");

    let mut backgrounds_stems = HashSet::new();
    for entry in read_dir(&paths.backgrounds)? {
        if let Some(stem) = file_stem(&entry?) {
            backgrounds_stems.insert(stem);
        }
    }

    let mut coa_stems = HashSet::new();
    for entry in read_dir(&paths.coa)? {
        if let Some(stem) = file_stem(&entry?) {
            coa_stems.insert(stem);
        }
    }

    let mut cities = Vec::new();
    for voivodeship in dataset.iter() {
        for city in voivodeship.content.iter() {
            let filename = format_file_name(city);
            let has_bg = backgrounds_stems.contains(&filename);
            let has_coa = coa_stems.contains(&filename);
            if !(has_bg && has_coa) {
                cities.push(city);
            }
        }
    }

    log!(
        [LogStyle::Blue],
        "SCRAPER",
        "Found {} cities that need scraping",
        cities.len()
    );

    let repeating_names: HashSet<&str> = {
        let mut name_counts: HashMap<&str, usize> = HashMap::new();
        for &city in &cities {
            *name_counts.entry(&city.name).or_default() += 1;
        }

        name_counts
            .iter()
            .filter_map(|(&name, &count)| if count > 1 { Some(name) } else { None })
            .collect()
    };

    let replacement_regex = Arc::new(Regex::new(r"/[^/]*?$").unwrap());

    let regexes_list = Arc::new([
        (
            Regex::new(r#"<img .*?alt="Herb" .*?src="(.+?)".*?>"#).unwrap(),
            Regex::new(r#"(?s)<tr class="grafika iboxs.*?<img .*?src="(.+?)".*?>"#).unwrap(),
        ),
        (
            Regex::new(r#"<img .*?alt="Herb" .*?src="(.+?)".*?>"#).unwrap(),
            Regex::new(r#"(?s).*<figure .*?typeof="mw:File/Thumb".*?<img .*?src="(.+?)".*?>"#)
                .unwrap(),
        ),
        (
            Regex::new(r#"<img .*?src="(.+?COA.+?)".*?>"#).unwrap(),
            Regex::new(r#"(?i)<img .*?alt="Ilustracja" .*?src="(.+?)".*?>"#).unwrap(),
        ),
    ]);

    let client = reqwest::Client::new();
    let download_counter = Arc::new(AtomicU32::new(0));
    let total_downloads = cities.len();

    let mut links: Vec<Option<(String, Links)>> = vec![];

    for chunk in cities.chunks(CONCURRENT_DOWNLOADS) {
        let mut join_set = JoinSet::new();
        for &city in chunk {
            let repeating = repeating_names.contains(&*city.name);
            if repeating {
                log!(
                    [LogStyle::Blue],
                    "REPEATING",
                    "Reversing suffixes for '{}'",
                    city.name
                );
            }

            let voivodeship_suffix = format!("_(województwo_{})", city.voivodeship);
            let powiat_suffix = format!("_(powiat_{})", city.powiat);

            let mut suffixes = [
                "".into(),
                "_(miasto)".into(),
                voivodeship_suffix,
                powiat_suffix,
            ];

            if repeating {
                suffixes.reverse();
            }

            join_set.spawn(try_page(
                city.name.clone(),
                city.identifier.clone(),
                suffixes,
                regexes_list.clone(),
                replacement_regex.clone(),
                client.clone(),
                download_counter.clone(),
                total_downloads,
            ));
        }

        let mut res = join_set.join_all().await;
        links.append(&mut res);
    }

    let collected_links: Vec<_> = links.into_iter().flatten().collect();
    log!(
        [LogStyle::Purple],
        "SCRAPER DONE",
        "Finished scraping in {:.4} s; {}{}{} OK, {}{}{} errors",
        start_time.elapsed().as_secs_f32(),
        LogStyle::Green,
        collected_links.len(),
        LogStyle::Clear,
        LogStyle::Red,
        total_downloads - collected_links.len(),
        LogStyle::Clear,
    );
    Ok((start_time.elapsed(), collected_links))
}

async fn download_city_files(
    data: Arc<(String, Links)>,
    client: Arc<reqwest::Client>,
) -> AppResult<()> {
    let req = client.get(&data.1.coa_link);
    req.send().await?;

    todo!()
}

pub async fn download_assets(links: Vec<(String, Links)>) {
    let start_time = time::Instant::now();
    let client = Arc::new(reqwest::Client::new());

    let links: Vec<Arc<(String, Links)>> = links.into_iter().map(|x| Arc::new(x)).collect();

    for chunk in links.chunks(CONCURRENT_DOWNLOADS) {
        let mut join_set: JoinSet<AppResult<()>> = JoinSet::new();

        for data in chunk {
            join_set.spawn(download_city_files(data.clone(), client.clone()));
        }

        let vec = join_set.join_all().await;
    }
    todo!()
}
