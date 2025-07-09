use crate::paths::Paths;
use std::fs;
use std::path::Path;

fn ensure_exists(path: &Path) -> std::io::Result<()> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }
    Ok(())
}

pub async fn process_assets(paths: &Paths) -> std::io::Result<()> {
    ensure_exists(&paths.backgrounds)?;
    ensure_exists(&paths.edited_backgrounds)?;
    ensure_exists(&paths.coa)?;
    ensure_exists(&paths.edited_coa)?;

    Ok(())
}
