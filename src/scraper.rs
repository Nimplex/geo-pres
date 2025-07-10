use regex::Regex;
use reqwest::Error;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};
use tokio::fs::{DirEntry, read_dir};

use crate::{
    log,
    logger::{LogStyle, log_msg},
    parser::{City, Voivodeship},
    paths::Paths,
    utils::{ensure_exists, format_file_name},
};

fn file_stem(entry: &DirEntry) -> Option<String> {
    entry.file_name().to_str().and_then(|name| {
        Path::new(name)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(|s| s.to_owned())
    })
}

async fn try_page(city: &City, suffix: String) -> Result<String, Error> {
    let city_link = format!("{}{}", city.name, suffix).replace(" ", "_");
    let url = format!("https://pl.wikipedia.org/wiki/{}", city_link);

    let response = reqwest::get(url).await?;
    let text = response.text().await?;

    Ok(text)
}

pub async fn scrape(paths: &Paths, dataset: &[Option<Voivodeship>]) -> std::io::Result<()> {
    ensure_exists(&paths.coa)?;
    ensure_exists(&paths.backgrounds)?;

    log!([LogStyle::Blue], "SCRAPER", "Checking for existing entries");

    let mut backgrounds_stems = HashSet::new();
    let mut background_files = read_dir(&paths.backgrounds).await?;
    while let Some(entry) = background_files.next_entry().await? {
        if let Some(stem) = file_stem(&entry) {
            backgrounds_stems.insert(stem);
        }
    }

    let mut coa_stems = HashSet::new();
    let mut coa_files = read_dir(&paths.coa).await?;
    while let Some(entry) = coa_files.next_entry().await? {
        if let Some(stem) = file_stem(&entry) {
            coa_stems.insert(stem);
        }
    }

    let mut cities = Vec::new();
    for voivodeship in dataset.iter().flatten() {
        for city in &voivodeship.content {
            let filename = format_file_name(&city);
            let has_bg = backgrounds_stems.contains(&filename);
            let has_coa = coa_stems.contains(&filename);
            if !(has_bg && has_coa) {
                cities.push(city.clone());
            }
        }
    }

    log!(
        [LogStyle::Purple],
        "SCRAPER",
        "Found {} cities that need scraping",
        cities.len()
    );

    let mut name_counts: HashMap<String, usize> = HashMap::new();
    for city in &cities {
        *name_counts.entry(city.name.clone()).or_default() += 1;
    }

    for city in &mut cities {
        if let Some(count) = name_counts.get(&city.name) {
            if *count > 1 {
                city.repeating = true;
            }
        }
    }

    let regexes_list = vec![
        vec![
            Regex::new(r#"<img .*?alt="Herb" .*?src="(.+?)".*?>"#),
            Regex::new(r#"<tr class="grafika iboxs.*?<img .*?src="(.+?)".*?>"#),
        ],
        vec![
            Regex::new(r#"<img .*?alt="Herb" .*?src="(.+?)".*?>"#),
            Regex::new(r#".*<figure .*?typeof="mw:File/Thumb".*?<img .*?src="(.+?)".*?>"#),
        ],
        vec![
            Regex::new(r#"<img .*?src="(.+?COA.+?)".*?>"#),
            Regex::new(r#"<img .*?alt="Ilustracja" .*?src="(.+?)".*?>"#),
        ],
    ];

    for (i, city) in cities.iter().enumerate() {
        if city.repeating {
            log!(
                [LogStyle::Yellow],
                "REPEATING",
                "Trying reversed suffixes for '{}'",
                city.name
            );
        }

        let mut suffixes = vec![
            "".into(),
            "_(miasto)".into(),
            format!("_(województwo_{})", city.voivodeship),
            format!("_(powiat {})", city.powiat),
        ];

        if city.repeating {
            suffixes.reverse();
        }

        for suffix in suffixes {
            if let Ok(city_content) = try_page(city, suffix).await {
                log!([LogStyle::Cyan], "CONTENT", "{}", city_content);
            }
        }
    }

    Ok(())
}
