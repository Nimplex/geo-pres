use crate::log;
use crate::logger::{LogStyle, log_msg};
use std::num::ParseIntError;
use std::path::Path;

const VOIVODESHIP_COUNT: usize = 16;
const DATA_COLUMNS: usize = 7;

#[derive(Debug)]
pub struct City {
    identifier: String,
    city_name: String,
    powiat: String,
    area_ha: u64,
    area_km: u64,
    total_population: u64,
    population_per_km: u64,
}

impl TryFrom<[&str; DATA_COLUMNS]> for City {
    type Error = ParseIntError;

    fn try_from(value: [&str; DATA_COLUMNS]) -> Result<Self, Self::Error> {
        Ok(Self {
            identifier: value[0].into(),
            city_name: value[1].into(),
            powiat: value[2].into(),
            area_ha: value[3].parse()?,
            area_km: value[4].parse()?,
            total_population: value[5].parse()?,
            population_per_km: value[6].parse()?,
        })
    }
}

pub struct Voivodeship {
    name: String,
    content: Vec<City>,
}

pub fn parse_csv(path: &Path) -> std::io::Result<[Option<Voivodeship>; VOIVODESHIP_COUNT]> {
    log!(
        [LogStyle::Blue, LogStyle::Bold],
        "PARSER",
        "Loading dataset {:?}...",
        path
    );

    let data = std::fs::read_to_string(path)?;

    log!(
        [LogStyle::Blue, LogStyle::Bold],
        "PARSER",
        "Parsing CSV dataset"
    );

    let mut dataset: [Option<Voivodeship>; VOIVODESHIP_COUNT] = Default::default();
    let mut current_voivodeship: i32 = -1;
    for line in data.lines() {
        let parts: [&str; DATA_COLUMNS] = line
            .split_terminator(',')
            .take(DATA_COLUMNS)
            .collect::<Vec<_>>()
            .try_into()
            .unwrap();

        // don't check parts[0] since the 1st cell contains a BYTE_ORDER_MARK
        if parts[2].is_empty() && !parts[1].is_empty() {
            current_voivodeship += 1;
            dataset[current_voivodeship as usize] = Some(Voivodeship {
                name: parts[1].trim().to_owned(),
                content: vec![],
            });
            continue;
        }

        let city: City = parts
            .try_into()
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;

        let cell = &mut dataset[current_voivodeship as usize];
        cell.as_mut().unwrap().content.push(city);
    }

    Ok(dataset)
}
