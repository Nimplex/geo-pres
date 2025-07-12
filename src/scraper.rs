use crate::{
    log,
    logger::{LogStyle, log_msg},
    parser::{VOIVODESHIP_COUNT, Voivodeship},
    paths::Paths,
    utils::{ensure_exists, format_file_name},
};
use regex::Regex;
use reqwest::Error;
use std::{
    collections::{HashMap, HashSet},
    fs::{DirEntry, read_dir},
    path::Path,
};
use tokio::task::JoinSet;

const CONCURRENT_DOWNLOADS: usize = 5;

fn file_stem(entry: &DirEntry) -> Option<String> {
    Some(
        Path::new(&entry.file_name())
            .file_stem()
            .unwrap()
            .to_str()?
            .to_owned(),
    )
}

async fn try_page<const N: usize>(
    city_name: String,
    suffixes: [String; N],
) -> Result<String, Error> {
    // TODO: add logging, return actual results, skip if not found
    for suffix in suffixes {
        let city_link = format!("{}{}", city_name, suffix).replace(" ", "_");
        let url = format!("https://pl.wikipedia.org/wiki/{city_link}");

        let response = reqwest::get(url).await?;
        if let Err(err) = response.error_for_status_ref() {
            
        }
        let text = response.text().await?;

        return Ok(text);
    }
    todo!()
}

pub async fn scrape(
    paths: &Paths,
    dataset: [Voivodeship; VOIVODESHIP_COUNT],
) -> std::io::Result<()> {
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
        [LogStyle::Purple],
        "SCRAPER",
        "Found {} cities that need scraping",
        cities.len()
    );

    let repeating_names: HashSet<&str> = {
        let mut name_counts: HashMap<&str, usize> = HashMap::new();
        for city in &cities {
            *name_counts.entry(&city.name).or_default() += 1;
        }

        name_counts
            .iter()
            .filter_map(|(&name, &count)| if count > 1 { Some(name) } else { None })
            .collect()
    };

    let regexes_list = [
        [
            Regex::new(r#"<img .*?alt="Herb" .*?src="(.+?)".*?>"#).unwrap(),
            Regex::new(r#"<tr class="grafika iboxs.*?<img .*?src="(.+?)".*?>"#).unwrap(),
        ],
        [
            Regex::new(r#"<img .*?alt="Herb" .*?src="(.+?)".*?>"#).unwrap(),
            Regex::new(r#".*<figure .*?typeof="mw:File/Thumb".*?<img .*?src="(.+?)".*?>"#).unwrap(),
        ],
        [
            Regex::new(r#"<img .*?src="(.+?COA.+?)".*?>"#).unwrap(),
            Regex::new(r#"<img .*?alt="Ilustracja" .*?src="(.+?)".*?>"#).unwrap(),
        ],
    ];

    let client = reqwest::Client::new();

    for chunk in cities.chunks(CONCURRENT_DOWNLOADS) {
        let mut join_set = JoinSet::new();
        for &city in chunk {
            let repeating = repeating_names.contains(&*city.name);
            if repeating {
                log!(
                    [LogStyle::Cyan],
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

            log!([LogStyle::Purple], "SCRAPER", "Trying `{}`", city.name);
            join_set.spawn(try_page(city.name.clone(), suffixes));
        }

        let res = join_set.join_all().await;
        // println!("{:?}", res);
    }

    Ok(())
}
