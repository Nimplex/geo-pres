use crate::{
    log,
    logger::{LogStyle, log_msg},
    utils::{AppError, AppResult},
};
use regex::Regex;
use std::{io, num::ParseIntError, path::Path, cmp::Reverse};

pub const VOIVODESHIP_COUNT: usize = 16;
const DATA_COLUMNS: usize = 7;

#[derive(Clone, Debug)]
pub struct City {
    pub identifier: String,
    pub name: String,
    pub powiat: String,
    pub area_ha: u64,
    pub area_km: u64,
    pub total_population: u64,
    pub population_per_km: u64,
    pub voivodeship: String,
}

impl TryFrom<([&str; DATA_COLUMNS], String)> for City {
    type Error = ParseIntError;

    fn try_from(value: ([&str; DATA_COLUMNS], String)) -> Result<Self, Self::Error> {
        let data = value.0;
        let voivodeship = value.1;
        Ok(Self {
            identifier: data[0].into(),
            name: data[1].into(),
            powiat: data[2].to_lowercase(),
            area_ha: data[3].parse()?,
            area_km: data[4].parse()?,
            total_population: data[5].parse()?,
            population_per_km: data[6].parse()?,
            voivodeship,
        })
    }
}

pub struct Voivodeship {
    pub name: String,
    pub content: Vec<City>,
}

pub fn parse_csv(path: &Path) -> AppResult<[Voivodeship; VOIVODESHIP_COUNT]> {
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

    let name_re = Regex::new(r"WOJ. ([\w-]*)").unwrap();
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
            let Some(caps) = name_re.captures(parts[1].trim()) else {
                return Err(AppError::Other("No voivodeship name found".into()));
            };

            dataset[current_voivodeship as usize] = Some(Voivodeship {
                name: caps[1].to_lowercase(),
                content: vec![],
            });
            continue;
        }

        let voivodeship_name = dataset[current_voivodeship as usize]
            .as_ref()
            .unwrap()
            .name
            .clone();

        let city: City = (parts, voivodeship_name)
            .try_into()
            .map_err(|err| AppError::Io(io::Error::new(io::ErrorKind::InvalidData, err)))?;

        let cell = &mut dataset[current_voivodeship as usize];
        cell.as_mut().unwrap().content.push(city);
    }

    let mut dataset: [Voivodeship; VOIVODESHIP_COUNT] = dataset.map(|x| {
        let mut value = x.unwrap();
        value.content.sort_by_key(|city| Reverse(city.total_population));
        value
    });

    dataset.sort_by_key(|value| {
        Reverse(value.content.iter().map(|city| city.total_population).sum::<u64>())
    });

    Ok(dataset)
}
