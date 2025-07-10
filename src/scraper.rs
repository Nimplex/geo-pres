use crate::{
    log,
    logger::{LogStyle, log_msg},
    parser::{City, VOIVODESHIP_COUNT, Voivodeship},
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

fn file_stem(entry: &DirEntry) -> Option<String> {
    Some(
        Path::new(&entry.file_name())
            .file_stem()
            .unwrap()
            .to_str()?
            .to_owned(),
    )
}

async fn try_page(city: &City, suffix: &str) -> Result<String, Error> {
    let city_link = format!("{}{}", city.name, suffix).replace(" ", "_");
    let url = format!("https://pl.wikipedia.org/wiki/{}", city_link);

    let response = reqwest::get(url).await?;
    let text = response.text().await?;

    Ok(text)
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
            let filename = format_file_name(&city);
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
            Regex::new(r#"<img .*?alt="Herb" .*?src="(.+?)".*?>"#),
            Regex::new(r#"<tr class="grafika iboxs.*?<img .*?src="(.+?)".*?>"#),
        ],
        [
            Regex::new(r#"<img .*?alt="Herb" .*?src="(.+?)".*?>"#),
            Regex::new(r#".*<figure .*?typeof="mw:File/Thumb".*?<img .*?src="(.+?)".*?>"#),
        ],
        [
            Regex::new(r#"<img .*?src="(.+?COA.+?)".*?>"#),
            Regex::new(r#"<img .*?alt="Ilustracja" .*?src="(.+?)".*?>"#),
        ],
    ];

    for &city in &cities {
        let repeating = repeating_names.contains(&*city.name);
        if repeating {
            log!(
                [LogStyle::Cyan],
                "REPEATING",
                "Trying reversed suffixes for '{}'",
                city.name
            );
        }

        let mut suffixes = [
            "",
            "_(miasto)",
            &format!("_(województwo_{})", city.voivodeship),
            &format!("_(powiat_{})", city.powiat),
        ];

        if repeating {
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
