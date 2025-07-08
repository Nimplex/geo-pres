use std::error::Error;

use crate::image_editor::process_assets;
use crate::paths::Paths;

mod logger;
mod paths;
mod image_editor;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let base_dir = std::env::current_dir().unwrap().to_path_buf();
    let paths = Paths::new(base_dir);

    process_assets(&paths).await?;

    Ok(())
}
