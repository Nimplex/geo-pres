use std::{fs, path::Path};

use crate::parser::City;

pub fn ensure_exists(path: &Path) -> std::io::Result<()> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }
    Ok(())
}

pub fn format_file_name(city: &City) -> String {
    format!(
        "{}+{}",
        city.identifier,
        city.name.replace(" ", "_")
    )
}