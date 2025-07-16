use crate::{
    log,
    logger::{LogStyle, log_msg},
    parser::Voivodeship,
    paths::Paths,
    utils::{AppError, AppResult, ReturnReport, ensure_exists, file_stem, format_file_name},
};
use image::{DynamicImage, GenericImageView, ImageBuffer, ImageFormat, Rgba, imageops};
use resvg::{
    tiny_skia::{Pixmap, Transform},
    usvg::{Options, Tree},
};
use std::{
    collections::{HashMap, HashSet},
    fs::{read_dir, read_to_string, write},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
    time,
};
use tokio::task::JoinSet;

const CONCURRENT_JOBS: usize = 32;

fn svg_to_png(svg_data: &str) -> AppResult<Vec<u8>> {
    let tree = Tree::from_str(svg_data, &Options::default())?;

    let size = tree.size();
    let width = size.width() as u32;
    let height = size.height() as u32;

    let mut pixmap = Pixmap::new(width, height).ok_or("Failed to create pixmap".to_owned())?;

    resvg::render(&tree, Transform::identity(), &mut pixmap.as_mut());

    Ok(pixmap
        .encode_png()
        .map_err(|err| AppError::Io(err.into()))?)
}

fn edit_background(input_path: &Path, output_path: &Path) -> AppResult<()> {
    const BORDER_SIZE: u32 = 2;
    const CITY_WIDTH: u32 = 1920;
    const CITY_HEIGHT: u32 = 270; // hardcoded value, 1080 / 4 entries = 270 pixels per entry. Also check pres_gen for entry generation
    const BLUR_SIGMA: f32 = 2.5;
    const BRIGHTNESS: i32 = -35;

    // actual content height, excluding 2px top and 2px bottom border
    const CONTENT_HEIGHT: u32 = CITY_HEIGHT - BORDER_SIZE * 2;

    let mut image = image::open(input_path)?;

    let (orig_width, orig_height) = image.dimensions();
    let aspect_ratio = orig_height as f32 / orig_width as f32;
    let new_height = (aspect_ratio * CITY_WIDTH as f32) as u32; // most of backgrounds are not 1920x1080 hence the need to calculate new height from aspect ratio

    image = image.resize_exact(
        CITY_WIDTH,
        new_height,
        image::imageops::FilterType::Lanczos3,
    );

    let top = if new_height < CONTENT_HEIGHT {
        0
    } else {
        (new_height - CONTENT_HEIGHT) / 2
    };

    let cropped = imageops::crop(&mut image, 0, top, CITY_WIDTH, CONTENT_HEIGHT);
    let cropped_img = DynamicImage::ImageRgba8(cropped.to_image()) // convert to DynamicImage to apply effects
        .brighten(BRIGHTNESS)
        .blur(BLUR_SIGMA);

    // create a new image of exact height 270 with 2px white borders at top and bottom
    let mut final_img =
        ImageBuffer::from_pixel(CITY_WIDTH, CITY_HEIGHT, Rgba([255, 255, 255, 255]));

    imageops::replace(&mut final_img, &cropped_img, 0, BORDER_SIZE as i64); // paste the cropped image into the center, leaving 2px top and bottom

    final_img.save_with_format(output_path, ImageFormat::WebP)?;

    Ok(())
}

fn edit_coa(input_path: &Path, output_path: &Path) -> AppResult<()> {
    const TARGET_WIDTH: u32 = 176;
    const TARGET_HEIGHT: u32 = 206;

    let mut image = image::open(input_path).unwrap();

    image = image.resize_exact(
        TARGET_WIDTH,
        TARGET_HEIGHT,
        image::imageops::FilterType::Lanczos3,
    );

    image
        .save_with_format(output_path, ImageFormat::WebP)
        .unwrap();

    Ok(())
}

#[derive(Debug, Clone, Copy)]
enum FileSet {
    Background,
    Coa,
}

async fn process_file(
    file_path: Arc<PathBuf>,
    edited_path: Arc<PathBuf>,
    file_set: FileSet,
    counter: Arc<AtomicU32>,
    total: usize,
) -> AppResult<()> {
    let file_stem = file_path.file_stem().unwrap().to_str().unwrap();
    let output_path = edited_path.join(format!("{}.webp", file_stem));

    let res = match file_set {
        FileSet::Background => edit_background(&file_path, &output_path),
        FileSet::Coa => edit_coa(&file_path, &output_path),
    };

    let count = counter.fetch_add(1, Ordering::Relaxed) + 1;

    match res {
        Ok(()) => log!(
            [LogStyle::Green],
            &format!("OK{:>13}", format!("{count}/{total}",)),
            "Saved {} to {}{output_path:?}{}",
            match file_set {
                FileSet::Background => "background",
                FileSet::Coa => "COA",
            },
            LogStyle::Cyan,
            LogStyle::Clear,
        ),

        Err(ref e) => log!(
            [LogStyle::Red],
            &format!("ERR{:>12}", format!("{count}/{total}",)),
            "Failed to process {file_stem}: {e}",
        ),
    };

    res
}

async fn process_file_set(
    paths: &Paths,
    dataset: &[Voivodeship],
    file_set: FileSet,
) -> AppResult<ReturnReport> {
    let start_time = time::Instant::now();
    let mut stem_to_filename: HashMap<String, String> = HashMap::new();

    let unedited_path = match file_set {
        FileSet::Background => &paths.backgrounds,
        FileSet::Coa => &paths.coas,
    };

    let edited_path = match file_set {
        FileSet::Background => &paths.edited_backgrounds,
        FileSet::Coa => &paths.edited_coas,
    };

    for entry in read_dir(unedited_path)? {
        let entry = entry?;
        let path = entry.path();
        if let (Some(stem), Some(ext)) = (file_stem(&entry.path()), path.extension()) {
            stem_to_filename.insert(stem, ext.to_str().unwrap().to_owned());
        }
    }

    let mut edited_file_stems = HashSet::new();
    for entry in read_dir(edited_path)? {
        if let Some(stem) = file_stem(&entry?.path()) {
            edited_file_stems.insert(stem);
        }
    }

    let mut file_paths = Vec::new();
    for voivodeship in dataset.iter() {
        for city in voivodeship.content.iter() {
            let stem = format_file_name(city);
            let is_present = edited_file_stems.contains(&stem);

            if !is_present && let Some(ext) = stem_to_filename.get(&stem) {
                let full_filename = format!("{stem}.{ext}");
                let file_path = unedited_path.join(full_filename);
                file_paths.push(file_path);
            }
        }
    }

    let amount_to_scrape = file_paths.len();

    log!(
        [LogStyle::Blue],
        "IMAGE EDITOR",
        "Found {} {} that need{} processing",
        amount_to_scrape,
        match file_set {
            FileSet::Background if amount_to_scrape == 1 => "background",
            FileSet::Coa if amount_to_scrape == 1 => "COA",
            FileSet::Background => "backgrounds",
            FileSet::Coa => "COAs",
        },
        if amount_to_scrape == 1 { "s" } else { "" }
    );

    for file_path in file_paths.iter_mut() {
        if file_path.extension().unwrap() == "svg" {
            let file_stem = file_stem(file_path).unwrap();
            let svg_data = read_to_string(file_path.clone())?;
            let png_data = svg_to_png(&svg_data)?;
            let file_name = format!("{}.png", file_stem);
            let new_path = paths.coas.join(file_name);

            log!(
                [LogStyle::Blue],
                "SVG",
                "Detected SVG file, converting to PNG: {new_path:?}",
            );

            write(&new_path, png_data).unwrap();

            *file_path = new_path;
        }
    }

    let total = file_paths.len();
    let counter = Arc::new(AtomicU32::new(0));
    let file_paths: Vec<Arc<PathBuf>> = file_paths.into_iter().map(Arc::new).collect();
    let edited_path = Arc::new(edited_path.clone());

    let mut amount_ok = 0;

    for chunk in file_paths.chunks(CONCURRENT_JOBS) {
        let mut join_set = JoinSet::new();
        for file_path in chunk.iter() {
            join_set.spawn(process_file(
                file_path.clone(),
                edited_path.clone(),
                file_set,
                counter.clone(),
                total,
            ));
        }

        amount_ok += join_set
            .join_all()
            .await
            .iter()
            .filter(|res| res.is_ok())
            .count();
    }

    Ok(ReturnReport {
        job_name: "IMAGE EDITOR: ".to_owned()
            + match file_set {
                FileSet::Background => "BG",
                FileSet::Coa => "COA",
            },
        duration: start_time.elapsed(),
        amount_ok,
        amount_err: total - amount_ok,
    })
}

pub async fn process_assets(
    paths: &Paths,
    dataset: &[Voivodeship],
) -> AppResult<(ReturnReport, ReturnReport)> {
    ensure_exists(&paths.backgrounds)?;
    ensure_exists(&paths.edited_backgrounds)?;
    ensure_exists(&paths.coas)?;
    ensure_exists(&paths.edited_coas)?;

    let background_report = process_file_set(paths, dataset, FileSet::Background).await?;
    log!([LogStyle::Purple], "JOB DONE", "{}", background_report);
    let coa_report = process_file_set(paths, dataset, FileSet::Coa).await?;
    log!([LogStyle::Purple], "JOB DONE", "{}", coa_report);

    Ok((background_report, coa_report))
}
