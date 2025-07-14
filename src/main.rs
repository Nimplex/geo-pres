use crate::{
    image_editor::process_assets,
    logger::{LogStyle, log_msg},
    parser::{Voivodeship, parse_csv},
    paths::Paths,
    scraper::{download_assets, get_links},
    utils::AppResult,
};

mod image_editor;
mod logger;
mod parser;
mod paths;
mod scraper;
mod utils;

fn display_dataset(dataset: &[Voivodeship]) {
    log!(
        [LogStyle::Blue],
        "TABLE",
        "{:<24} {:<25} {:<25} {:>15} {:>15}",
        "Voivodeship",
        "City",
        "Powiat",
        "Population",
        "Area (km²)"
    );

    for voivodeship in dataset.iter() {
        for city in &voivodeship.content {
            log!(
                [LogStyle::Blue],
                "TABLE",
                "{:<24} {:<25} {:<25} {:>15} {:>15}",
                voivodeship.name,
                city.name,
                city.powiat,
                city.total_population,
                city.area_km
            );
        }
    }
}

#[tokio::main]
async fn main() -> AppResult<()> {
    let paths = Paths::new()?;

    let dataset = parse_csv(&paths.dataset)?;
    display_dataset(&dataset);
    let (scrape_time, links) = get_links(&paths, &dataset).await?;

    download_assets(links, paths.clone()).await;
    process_assets(&paths).await?;

    Ok(())
}
