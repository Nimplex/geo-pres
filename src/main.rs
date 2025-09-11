use crate::{
    image_editor::process_assets,
    logger::{LogStyle, log_msg},
    parser::{Voivodeship, parse_csv},
    paths::Paths,
    scraper::{download_assets, get_links},
    slides_gen::generate_slides,
    utils::AppResult,
};

mod image_editor;
mod logger;
mod parser;
mod paths;
mod scraper;
mod slides_gen;
mod utils;

fn display_dataset(paths: &Paths, dataset: &[Voivodeship]) {
    let table_header = format!(
        "{:<24} {:<25} {:>10} {:>10}",
        "City", "Powiat", "Population", "Area (km²)"
    );

    let iteratable_dataset = dataset.into_iter();
    let voivodeship_count = iteratable_dataset.len();
    let cities_count = iteratable_dataset.map(|voivode| voivode.content.len()).sum::<usize>();
    let total_size = voivodeship_count + cities_count + 1; // every voivodeship is separated with
                                                           // a ===...[name]...=== line so we have
                                                           // to account for that in total size
                                                           // `voivodeship_count`. There's
                                                           // also one row for every city
                                                           // `cities_count` and 1 row for header.
    let mut rows = Vec::with_capacity(total_size);
    rows.push(table_header);

    for voivodeship in dataset.iter() {
        let total_width: usize = 72;
        let name = &voivodeship.name;

        let space = total_width.saturating_sub(name.chars().count());
        let left = space / 2;
        let right = space - left;

        let line = format!(
            "{:=<left$}{}{:=<right$}",
            "",
            name,
            "",
            left = left,
            right = right
        );
        rows.push(line);

        for city in &voivodeship.content {
            rows.push(format!(
                "{:<24} {:<25} {:>10} {:>10}",
                city.name, city.powiat, city.total_population, city.area_km
            ));
        }
    }

    std::fs::write(&paths.data.join("skrypt.txt"), rows.join("\n"))
        .expect("Couldn't save skrypt.txt");
}

#[tokio::main]
async fn main() -> AppResult<()> {
    let paths = Paths::new()?;

    let dataset = parse_csv(&paths.dataset)?;
    display_dataset(&paths, &dataset);

    let (scraper_report, links) = get_links(&paths, &dataset).await?;
    log!([LogStyle::Purple], "JOB DONE", "{scraper_report}");

    let downloader_report = download_assets(links, &paths).await?;
    log!([LogStyle::Purple], "JOB DONE", "{downloader_report}");

    let (background_edit_report, coa_edit_report) = process_assets(&paths, &dataset).await?;

    let slides_gen_report = generate_slides(&paths, &dataset)?;

    let total = scraper_report.clone()
        + downloader_report.clone()
        + background_edit_report.clone()
        + coa_edit_report.clone()
        + slides_gen_report.clone();

    log!(
        [LogStyle::Purple, LogStyle::Bold],
        "FINISHED",
        "Finished processing. Stats:\n{0}\n{scraper_report}\n{downloader_report}\n{background_edit_report}\n{coa_edit_report}\n{slides_gen_report}\n{0}\n{total}",
        "=".repeat(60),
    );

    log!(
        [LogStyle::Bold],
        "FINISHED",
        "Now run '{}bun run pres_gen/main.ts{}' to compile presentation",
        LogStyle::Bold,
        LogStyle::Clear,
    );

    Ok(())
}
