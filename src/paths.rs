use std::path::PathBuf;

pub struct Paths {
    pub data_dir: PathBuf,
    pub dataset: PathBuf,
    pub coa: PathBuf,
    pub edited_coa: PathBuf,
    pub backgrounds: PathBuf,
    pub edited_backgrounds: PathBuf,
    pub slides: PathBuf,
}

impl Paths {
    pub fn new(base_dir: PathBuf) -> Self {
        let data = base_dir.join(r"../data");
        Self {
            data_dir: data.clone(),
            dataset: data.join("dane.csv"),
            coa: data.join("coats-of-arms"),
            edited_coa: data.join("edited-coats-of-arms"),
            backgrounds: data.join("backgrounds"),
            edited_backgrounds: data.join("edited-backgrounds"),
            slides: data.join("slides"),
        }
    }
}
