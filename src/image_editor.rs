use std::{
    collections::{HashMap, HashSet},
    fs::{read_dir, read_to_string, write},
};

use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{Options, Tree};

use crate::{
    log,
    logger::{LogStyle, log_msg},
    parser::Voivodeship,
    paths::Paths,
    utils::{AppResult, ensure_exists, file_stem, format_file_name},
};

fn svg_to_png(svg_data: &str) -> AppResult<Vec<u8>> {
    let tree = Tree::from_str(svg_data, &Options::default()).unwrap();

    let size = tree.size();
    let width = size.width() as u32;
    let height = size.height() as u32;

    let mut pixmap = Pixmap::new(width, height)
        .ok_or("Failed to create pixmap")
        .unwrap();

    resvg::render(&tree, Transform::identity(), &mut pixmap.as_mut());

    Ok(pixmap.encode_png().unwrap())
}

async fn process_backgrounds(paths: &Paths, dataset: &[Voivodeship]) -> AppResult<()> {
    let mut stem_to_filename: HashMap<String, String> = HashMap::new();
    for entry in read_dir(&paths.backgrounds)? {
        let entry = entry?;
        let path = entry.path();
        if let (Some(stem), Some(ext)) = (file_stem(&entry), path.extension()) {
            stem_to_filename.insert(stem, ext.to_str().unwrap().to_owned());
        }
    }

    let mut edited_backgrounds_stems = HashSet::new();
    for entry in read_dir(&paths.edited_backgrounds)? {
        if let Some(stem) = file_stem(&entry?) {
            edited_backgrounds_stems.insert(stem);
        }
    }

    let mut backgrounds_paths = Vec::new();
    for voivodeship in dataset.iter() {
        for city in voivodeship.content.iter() {
            let stem = format_file_name(city);
            let has_bg = edited_backgrounds_stems.contains(&stem);

            if !has_bg && let Some(ext) = stem_to_filename.get(&stem) {
                let full_filename = format!("{stem}.{ext}");
                let file_path = paths.backgrounds.join(full_filename);
                backgrounds_paths.push(file_path);
            }
        }
    }

    log!(
        [LogStyle::Blue],
        "IMAGE_EDITOR",
        "Found {} backgrounds that need processing",
        backgrounds_paths.len()
    );

    for file_path in backgrounds_paths.iter() {
        if file_path.extension().unwrap().to_owned() == "svg" {
            let svg_data = read_to_string(file_path).unwrap();
            let png_data = svg_to_png(&svg_data).unwrap();
            let file_stem = file_path.file_stem().unwrap().to_str().unwrap();
            let file_name = format!("{}.png", file_stem);
            let new_path = paths.backgrounds.join(file_name);

            log!(
                [LogStyle::Blue],
                "SVG",
                "Detected SVG file, converting to PNG: {}",
                new_path.to_str().to_owned().unwrap()
            );

            write(new_path, png_data).unwrap();
        }
    }

    Ok(())
}

pub async fn process_assets(paths: &Paths, dataset: &[Voivodeship]) -> AppResult<()> {
    ensure_exists(&paths.backgrounds)?;
    ensure_exists(&paths.edited_backgrounds)?;
    ensure_exists(&paths.coa)?;
    ensure_exists(&paths.edited_coa)?;

    process_backgrounds(paths, dataset).await?;

    Ok(())
}
