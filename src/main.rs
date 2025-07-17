use crate::{
    image_editor::process_assets,
    logger::{LogStyle, log_msg},
    parser::{Voivodeship, parse_csv},
    paths::Paths,
    slides_gen::generate_slides,
    scraper::{download_assets, get_links},
    utils::AppResult,
};

mod image_editor;
mod logger;
mod parser;
mod paths;
mod slides_gen;
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

    let (scraper_report, links) = get_links(&paths, &dataset).await?;
    log!([LogStyle::Purple], "JOB DONE", "{}", scraper_report);

    let downloader_report = download_assets(links, paths.clone()).await?;
    log!([LogStyle::Purple], "JOB DONE", "{}", downloader_report);

    let (background_edit_report, coa_edit_report) = process_assets(&paths, &dataset).await?;

    generate_slides(&paths, &dataset).unwrap();

    log!(
        [LogStyle::Purple, LogStyle::Bold],
        "FINISHED",
        "Finished processing. Stats:\n{}\n{scraper_report}\n{downloader_report}\n{background_edit_report}\n{coa_edit_report}",
        "=".repeat(60),
    );

    log!([LogStyle::Bold], "FINISHED", "Now run 'bun run pres_gen/main.ts' to compile presentation");

    Ok(())
}
