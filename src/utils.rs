use crate::parser::City;
use std::{fs::{self, DirEntry}, io, path::Path};

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug)]
#[allow(dead_code)]
pub enum AppError {
    Io(io::Error),
    Request(reqwest::Error),
    Other(String),
}

impl From<io::Error> for AppError {
    fn from(value: io::Error) -> Self {
        AppError::Io(value)
    }
}

impl From<reqwest::Error> for AppError {
    fn from(value: reqwest::Error) -> Self {
        AppError::Request(value)
    }
}

impl From<String> for AppError {
    fn from(value: String) -> Self {
        AppError::Other(value)
    }
}

impl std::error::Error for AppError {}
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Io(error) => write!(f, "{error}"),
            AppError::Request(error) => write!(f, "{error}"),
            AppError::Other(error) => write!(f, "{error}"),
        }
    }
}

pub fn ensure_exists(path: &Path) -> AppResult<()> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }
    Ok(())
}

pub fn format_file_name_parts(city_identifier: &str, city_name: &str) -> String {
    format!(
        "{}+{}",
        city_identifier.replace(' ', "_"),
        city_name.replace(' ', "_")
    )
}

pub fn format_file_name(city: &City) -> String {
    format_file_name_parts(&city.identifier, &city.name)
}

pub fn file_stem(entry: &DirEntry) -> Option<String> {
    Some(
        Path::new(&entry.file_name())
            .file_stem()
            .unwrap()
            .to_str()?
            .to_owned(),
    )
}