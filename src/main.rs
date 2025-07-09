use crate::image_editor::process_assets;
use crate::parser::parse_csv;
use crate::paths::Paths;
use std::error::Error;

mod image_editor;
mod logger;
mod parser;
mod paths;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let base_dir = std::env::current_dir()?;
    let paths = Paths::new(base_dir);

    process_assets(&paths).await?;
    parse_csv(&paths.dataset)?;

    Ok(())
}
