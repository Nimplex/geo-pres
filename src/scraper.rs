use crate::{
    log,
    logger::{LogStyle, log_msg},
    parser::{VOIVODESHIP_COUNT, Voivodeship},
    paths::Paths,
    utils::{
        AppError, AppResult, ensure_exists, file_stem, format_file_name, format_file_name_parts,
    },
};
use regex::Regex;
use std::{
    collections::{HashMap, HashSet},
    fs::read_dir,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
    time,
};
use tokio::task::JoinSet;

const CONCURRENT_DOWNLOADS: usize = 10;
const USER_AGENT: &str = "radio/video";

pub struct Links {
    pub coa_link: String,
    pub bg_link: String,
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
    city_data: (String, String),
    suffixes: [String; N],
    regexes: Arc<[(Regex, Regex); M]>,
    replacement_regex: Arc<Regex>,
    client: reqwest::Client,
    counter: Arc<AtomicU32>,
    total: usize,
) -> Option<(String, Links)> {
    let city_name = city_data.0;
    let city_identifier = city_data.1;

    for (coa_regex, bg_regex) in regexes.iter() {
        for suffix in &suffixes {
            let city_link = format!("{city_name}{suffix}").replace(' ', "_");
            let url = format!("https://pl.wikipedia.org/wiki/{city_link}");

            let response = client
                .get(url)
                .send()
                .await
                .inspect_err(|err| log!([LogStyle::Bold, LogStyle::Red], "CRITICAL ERROR", "{err}"))
                .ok()?;

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

            let text = response
                .text()
                .await
                .inspect_err(|err| log!([LogStyle::Bold, LogStyle::Red], "CRITICAL ERROR", "{err}"))
                .ok()?;

            let Some(coa_captures) = coa_regex.captures(&text) else {
                log_try_page(false, "NO MATCH", "no COA", city_link);
                continue;
            };

            let Some(bg_captures) = bg_regex.captures(&text) else {
                log_try_page(false, "NO MATCH", "no background", city_link);
                continue;
            };

            let bg_cap = bg_captures.get(1).unwrap().as_str();
            let coa_cap = coa_captures.get(1).unwrap().as_str();

            if coa_cap == bg_cap {
                log_try_page(false, "NO MATCH", "images repeat", city_link);
                continue;
            };

            let coa_link = String::from("https:") + coa_cap;
            let bg_link = String::from("https:")
                + &replacement_regex.replace(&bg_cap.replace("/thumb", ""), "");

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
    let start_time = time::Instant::now();

    ensure_exists(&paths.coa)?;
    ensure_exists(&paths.backgrounds)?;

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

    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;
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
                (city.name.clone(), city.identifier.clone()),
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

async fn download_image(
    client: Arc<reqwest::Client>,
    link: &str,
    file_name: &str,
    folder: &Path,
    counter: Arc<AtomicU32>,
    total: usize,
) -> AppResult<()> {
    let default_type = &reqwest::header::HeaderValue::from_static("image/raw");
    let res = client
        .get(link)
        .send()
        .await
        .inspect_err(|err| log!([LogStyle::Bold, LogStyle::Red], "CRITICAL ERROR", "{err}"))?;

    if let Err(err) = res.error_for_status_ref() {
        log!(
            [LogStyle::Red],
            "ERR",
            "Couldn't download COA for {}: Server returned {}{} {}{}",
            file_name,
            LogStyle::Italic,
            err.status().unwrap().as_u16(),
            err.status().unwrap().canonical_reason().unwrap(),
            LogStyle::Clear,
        );

        return Err(err.into());
    }

    let extension = res
        .headers()
        .get("Content-Type")
        .unwrap_or(default_type)
        .to_str()
        .map_err(|_| AppError::Other("request conversion error".into()))
        .inspect_err(|err| log!([LogStyle::Bold, LogStyle::Red], "CRITICAL ERROR", "{err}"))?
        .trim_start_matches("image/")
        .trim_end_matches("+xml");

    let file_path = folder.join(format!("{file_name}.{extension}"));
    let bytes = res.bytes().await.inspect_err(|err| {
        log!(
            [LogStyle::Red],
            "ERR",
            "Couldn't fetch bytes from the server: {err}"
        )
    })?;

    log!(
        [LogStyle::Green],
        &format!(
            "OK{:>13}",
            format!("{}/{total}", counter.fetch_add(1, Ordering::Relaxed) + 1)
        ),
        "Downloaded! Saving to {}{:?}{}",
        LogStyle::Cyan,
        file_path,
        LogStyle::Clear
    );

    std::fs::write(file_path, bytes).inspect_err(|err| {
        log!(
            [LogStyle::Bold, LogStyle::Red],
            "CRITICAL ERROR",
            "Failed to write: {err}"
        )
    })?;

    Ok(())
}

pub async fn download_assets(links: Vec<(String, Links)>, paths: Paths) -> AppResult<()> {
    let start_time = time::Instant::now();

    ensure_exists(&paths.coa)?;
    ensure_exists(&paths.backgrounds)?;

    let client = Arc::new(reqwest::Client::builder().user_agent(USER_AGENT).build()?);
    let counter = Arc::new(AtomicU32::new(0));
    let paths = Arc::new(paths);
    let links: Vec<Arc<(String, Links)>> = links.into_iter().map(Arc::new).collect();
    let total_to_download = links.len() * 2;
    let mut total_downloaded = vec![];

    for chunk in links.chunks(CONCURRENT_DOWNLOADS) {
        let mut join_set: JoinSet<AppResult<()>> = JoinSet::new();

        for data in chunk {
            let data = data.clone();
            let client = client.clone();
            let paths = paths.clone();
            let counter = counter.clone();

            join_set.spawn(async move {
                download_image(
                    client.clone(),
                    &data.1.coa_link,
                    &data.0,
                    &paths.coa,
                    counter.clone(),
                    total_to_download,
                )
                .await?;
                download_image(
                    client,
                    &data.1.bg_link,
                    &data.0,
                    &paths.backgrounds,
                    counter,
                    total_to_download,
                )
                .await?;

                Ok(())
            });
        }

        let mut vec = join_set.join_all().await;
        total_downloaded.append(&mut vec);
    }
    let total_downloaded = total_downloaded.into_iter().filter(|x| x.is_ok()).count() * 2;

    log!(
        [LogStyle::Purple],
        "DOWNLOADS DONE",
        "Finished downloading files in {:.4} s; {}{}{} OK, {}{}{} errors",
        start_time.elapsed().as_secs_f32(),
        LogStyle::Green,
        total_downloaded,
        LogStyle::Clear,
        LogStyle::Red,
        total_to_download - total_downloaded,
        LogStyle::Clear,
    );
    Ok(())
}
