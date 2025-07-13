use crate::{
    paths::Paths,
    utils::{AppResult, ensure_exists},
};

pub async fn process_assets(paths: &Paths) -> AppResult<()> {
    ensure_exists(&paths.backgrounds)?;
    ensure_exists(&paths.edited_backgrounds)?;
    ensure_exists(&paths.coa)?;
    ensure_exists(&paths.edited_coa)?;

    Ok(())
}
