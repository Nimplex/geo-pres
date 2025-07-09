use crate::log;
use crate::logger::{LogStyle, log_msg};
use std::path::Path;

#[derive(Debug)]
pub struct City {
    identifier: String,
    name: String,
    powiat: String,
    area_ha: f32,
    area_km: f32,
    population_per_km: f32,
    total_population: u64,
}

#[derive(Default)]
pub struct Voivodeship {
    name: String,
    content: Vec<City>,
}

pub fn parse_csv(path: &Path) -> std::io::Result<()> {
    let data = std::fs::read_to_string(path)?;

    let mut dataset: [Voivodeship; 16] = Default::default();

    log!(
        [LogStyle::Blue, LogStyle::Bold],
        "PARSER",
        "Parsing CSV dataset"
    );

    for (idx, line) in data.lines().enumerate() {
        let parts: Vec<&str> = line.split_terminator(',').collect();
        // TODO: finish this (i'll take care of it)
        todo!();
    }

    Ok(())
}
