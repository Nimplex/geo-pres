use crate::image_editor::process_assets;
use crate::logger::{LogStyle, log_msg};
use crate::parser::{parse_csv, Voivodeship};
use crate::paths::Paths;
use std::error::Error;

mod image_editor;
mod logger;
mod parser;
mod paths;

fn display_table(dataset: &[Option<Voivodeship>]) {
    log!(
        [LogStyle::Blue],
        "TABLE",
        "{:<24} {:<25} {:>15} {:>15}",
        "Voivodeship",
        "City",
        "Population",
        "Area (km²)"
    );

    for voivodeship in dataset.iter().flatten() {
        for city in &voivodeship.content {
            log!(
                [LogStyle::Blue],
                "TABLE",
                "{:<24} {:<25} {:>15} {:>15}",
                voivodeship.name,
                city.city_name,
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

    process_assets(&paths).await?;

    Ok(())
}
