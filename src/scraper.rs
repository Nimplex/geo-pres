use std::{collections::HashSet, path::Path};
use tokio::fs::{DirEntry, read_dir};

use crate::{
    log,
    logger::{LogStyle, log_msg},
    parser::Voivodeship,
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

    let mut cities_to_scrape = Vec::new();
    for voivodeship in dataset.iter().flatten() {
        for city in &voivodeship.content {
            let filename = format_file_name(&city);
            let has_bg = backgrounds_stems.contains(&filename);
            let has_coa = coa_stems.contains(&filename);
            if !(has_bg && has_coa) {
                cities_to_scrape.push(city);
            }
        }
    }

    log!(
        [LogStyle::Purple],
        "SCRAPER",
        "Found {} cities that need scraping",
        cities_to_scrape.len()
    );

    for city in cities_to_scrape {
    }

    Ok(())
}
