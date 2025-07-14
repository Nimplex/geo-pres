use crate::utils::{AppError, AppResult};
use std::{io, path::PathBuf};

#[derive(Clone)]
pub struct Paths {
    pub dataset: PathBuf,
    pub coa: PathBuf,
    pub edited_coa: PathBuf,
    pub backgrounds: PathBuf,
    pub edited_backgrounds: PathBuf,
    pub slides: PathBuf,
}

pub fn workspace_root() -> AppResult<PathBuf> {
    let cwd = std::env::current_dir()?;

    for path in cwd.ancestors() {
        for file in std::fs::read_dir(path)? {
            if file?.file_name() == "Cargo.lock" {
                return Ok(path.to_owned());
            }
        }
    }

    Err(AppError::Io(io::Error::new(
        io::ErrorKind::NotFound,
        "couldn't find Cargo.lock in the working directory nor in it's parents",
    )))
}

impl Paths {
    pub fn new() -> AppResult<Self> {
        let base_dir = workspace_root()?;
        let data = base_dir.join("data");
        Ok(Self {
            dataset: data.join("dane.csv"),
            coa: data.join("coats-of-arms"),
            edited_coa: data.join("edited-coats-of-arms"),
            backgrounds: data.join("backgrounds"),
            edited_backgrounds: data.join("edited-backgrounds"),
            slides: data.join("slides"),
        })
    }
}
