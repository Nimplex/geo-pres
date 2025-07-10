use crate::{
    image_editor::process_assets,
    logger::{LogStyle, log_msg},
    parser::{Voivodeship, parse_csv},
    paths::Paths,
    scraper::scrape,
};
use std::error::Error;

mod image_editor;
mod logger;
mod parser;
mod paths;
mod scraper;
mod utils;

fn display_table(dataset: &[Voivodeship]) {
    log!(
        [LogStyle::Blue],
        "TABLE",
        "{:<24} {:<25} {:>15} {:>15}",
        "Voivodeship",
        "City",
        "Population",
        "Area (km²)"
    );

    for voivodeship in dataset.iter() {
        for city in &voivodeship.content {
            log!(
                [LogStyle::Blue],
                "TABLE",
                "{:<24} {:<25} {:>15} {:>15}",
                voivodeship.name,
                city.name,
                city.total_population,
                city.area_km
            );
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let base_dir = std::env::current_dir()?;

    println!("{base_dir:?}");
    let paths = Paths::new()?;

    let dataset = parse_csv(&paths.dataset)?;
    display_table(&dataset);
    scrape(&paths, dataset).await?;

    process_assets(&paths).await?;

    Ok(())
}
