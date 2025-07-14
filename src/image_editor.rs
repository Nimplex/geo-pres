use image::{DynamicImage, GenericImageView, ImageBuffer, ImageFormat, Rgba, imageops};
use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{Options, Tree};
use std::path::Path;
use std::{
    collections::{HashMap, HashSet},
    fs::{read_dir, read_to_string, write},
};

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

pub fn edit_background(input_path: &Path, output_path: &Path) -> AppResult<()> {
    let blur_sigma = 3.5;
    let brightness = -35;
    let city_width = 1920;
    let city_height = 270;

    let content_height = city_height - 4; // actual content height, excluding 2px top and 2px bottom border

    let mut image = image::open(input_path).unwrap();

    let (orig_width, orig_height) = image.dimensions();
    let aspect_ratio = orig_height as f32 / orig_width as f32;
    let new_height = (aspect_ratio * city_width as f32) as u32; // most of backgrounds are not 1920x1080 since the need to calculate new height from aspect ratio

    image = image.resize_exact(
        city_width,
        new_height,
        image::imageops::FilterType::Lanczos3,
    );

    let top = if new_height < content_height {
        0
    } else {
        (new_height - content_height) / 2
    };

    let cropped = imageops::crop(&mut image, 0, top, city_width, content_height);
    let mut cropped_img = DynamicImage::ImageRgba8(cropped.to_image()); // convert to DynamicImage to apply effects

    cropped_img = cropped_img.brighten(brightness);
    cropped_img = cropped_img.blur(blur_sigma);

    // create a new image of exact height 270 with 2px white borders at top and bottom
    let mut final_img =
        ImageBuffer::from_pixel(city_width, city_height, Rgba([255, 255, 255, 255]));

    imageops::replace(&mut final_img, &cropped_img, 0, 2); // paste the cropped image into the center, leaving 2px top and bottom

    final_img
        .save_with_format(output_path, ImageFormat::WebP)
        .unwrap();

    Ok(())
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

    for file_path in backgrounds_paths.iter_mut() {
        if file_path.extension().unwrap().to_owned() == "svg" {
            let file_stem = file_path.file_stem().unwrap().to_str().unwrap().to_owned();
            let svg_data = read_to_string(file_path.clone()).unwrap();
            let png_data = svg_to_png(&svg_data).unwrap();
            let file_name = format!("{}.png", file_stem);
            let new_path = paths.backgrounds.join(file_name);

            log!(
                [LogStyle::Blue],
                "SVG",
                "Detected SVG file, converting to PNG: {}",
                new_path.to_str().to_owned().unwrap()
            );

            write(&new_path, png_data).unwrap();

            *file_path = new_path;
        }
    }

    for file_path in backgrounds_paths {
        let file_stem = file_path.file_stem().unwrap().to_str().unwrap();
        let output_path = paths.edited_backgrounds.join(format!("{}.webp", file_stem));

        match edit_background(&file_path, &output_path) {
            Ok(()) => log!(
                [LogStyle::Green],
                "IMAGE_EDITOR",
                "Successfully processed: {}",
                file_stem
            ),
            Err(e) => log!(
                [LogStyle::Red],
                "IMAGE_EDITOR",
                "Failed to process {}: {}",
                file_stem,
                e
            ),
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
