use crate::paths::Paths;
use crate::utils::ensure_exists;

pub async fn process_assets(paths: &Paths) -> std::io::Result<()> {
    ensure_exists(&paths.backgrounds)?;
    ensure_exists(&paths.edited_backgrounds)?;
    ensure_exists(&paths.coa)?;
    ensure_exists(&paths.edited_coa)?;

    Ok(())
}
