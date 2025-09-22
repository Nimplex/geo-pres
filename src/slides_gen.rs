use crate::{
    log,
    logger::{LogStyle, log_msg},
    parser::{City, VOIVODESHIP_COUNT, Voivodeship},
    paths::Paths,
    utils::{AppResult, ReturnReport, capitalize, ensure_exists, format_file_name},
};
use ab_glyph::{FontRef, PxScale};
use image::{ImageBuffer, ImageFormat, Rgba, RgbaImage, imageops::overlay};
use imageproc::drawing::{draw_text_mut, text_size};
use std::fs::{File, read};

struct Fonts<'a> {
    regular: FontRef<'a>,
    bold: FontRef<'a>,
}

struct Icons {
    home: ImageBuffer<Rgba<u8>, Vec<u8>>, 
    population: ImageBuffer<Rgba<u8>, Vec<u8>>,
    area: ImageBuffer<Rgba<u8>, Vec<u8>>,
}

fn draw_text(
    img: &mut RgbaImage,
    text: &str,
    font: &FontRef,
    x: i32,
    y: i32,
    font_size: f32,
    color: Rgba<u8>,
) -> (u32, u32) {
    let scale = PxScale::from(font_size);

    // there's no other way to render border around text with this library
    // so this is what I came up with. It **is** slow, needs rewrite
    for dx in -1..=1 {
        for dy in -1..=1 {
            if dx != 0 || dy != 0 {
                draw_text_mut(
                    img,
                    Rgba([0, 0, 0, 255]),
                    x + dx,
                    y + dy,
                    scale,
                    &font,
                    text,
                );
            }
        }
    }

    draw_text_mut(img, color, x, y, scale, &font, text);

    text_size(scale, &font, text)
}

fn generate_title(font: &Fonts, voivodeship: &str) -> AppResult<ImageBuffer<Rgba<u8>, Vec<u8>>> {
    let mut image = ImageBuffer::from_pixel(1920, 1080, Rgba([0, 0, 0, 255]));

    let text = format!("woj. {}", capitalize(voivodeship));

    let (width, height) = text_size(PxScale::from(100.0), &font.bold, &text);
    let x = image.width() / 2 - width / 2;
    let y = image.height() / 2 - height / 2;

    draw_text(
        &mut image,
        &text,
        &font.bold,
        x as i32,
        y as i32,
        100.0,
        Rgba([255, 255, 255, 255]),
    );

    Ok(image)
}

fn generate_map_slide(
    paths: &Paths,
    font: &Fonts,
    icons: &Icons,
    voivodeship: &Voivodeship,
) -> AppResult<ImageBuffer<Rgba<u8>, Vec<u8>>> {
    const PADDING: u32 = 64;

    let mut image = ImageBuffer::from_pixel(1920, 1080, Rgba([0, 0, 0, 255]));

    let map_path = paths
        .maps
        .join(format!("{}_transparent.png", voivodeship.name));
    let mut map = image::open(map_path)?;
    let (map_width, map_height) = image.dimensions();
    let aspect_ratio = map_width / map_height;
    let new_height = aspect_ratio * 1080 - (PADDING * 2);
    let new_width = new_height * aspect_ratio;
    map = map.resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3);
    overlay(&mut image, &map.to_rgba8(), PADDING.into(), PADDING.into());

    let mut text_offset: (u32, u32) = (PADDING * 3 + new_width, PADDING * 2);

    let text = format!("woj. {}", capitalize(&voivodeship.name));
    let stat_size = text_size(PxScale::from(80.0), &font.bold, &text);
    draw_text(
        &mut image,
        &text,
        &font.bold,
        text_offset.0 as i32,
        text_offset.1 as i32,
        80.0,
        Rgba([255, 255, 255, 255]),
    );
    text_offset.1 = text_offset.1 + stat_size.1 + 64;

    let city_count = voivodeship.content.len();
    let text = format!("{city_count} miast");
    let stat_size = text_size(PxScale::from(64.0), &font.regular, &text);
    let home_icon_y =
        text_offset.1 as i32 + (stat_size.1 as i32 / 2);

    draw_text(
        &mut image,
        &text,
        &font.regular,
        text_offset.0 as i32 + icons.home.width() as i32 + 16,
        text_offset.1 as i32,
        64.0,
        Rgba([255, 255, 255, 255]),
    );
    overlay(
        &mut image,
        &icons.home,
        text_offset.0 as i64,
        home_icon_y as i64,
    );

    text_offset.1 = text_offset.1 + stat_size.1 + 64;

    let text = format!("{} ({}/km²)", voivodeship.total_population, voivodeship.population_per_km);
    let stat_size = text_size(PxScale::from(64.0), &font.regular, &text);
    let population_icon_y =
        text_offset.1 as i32 + (stat_size.1 as i32 / 2);

    draw_text(
        &mut image,
        &text,
        &font.regular,
        text_offset.0 as i32 + icons.population.width() as i32 + 16,
        text_offset.1 as i32,
        64.0,
        Rgba([255, 255, 255, 255]),
    );
    overlay(
        &mut image,
        &icons.population,
        text_offset.0 as i64,
        population_icon_y as i64,
    );

    text_offset.1 = text_offset.1 + stat_size.1 + 64;

    let text = format!("{} km² ({} ha)", voivodeship.area_km, voivodeship.area_ha);
    let stat_size = text_size(PxScale::from(64.0), &font.regular, &text);
    let area_icon_y =
        text_offset.1 as i32 - (icons.area.height() as i32 / 2) + (stat_size.1 as i32 / 2);

    draw_text(
        &mut image,
        &text,
        &font.regular,
        text_offset.0 as i32 + icons.area.width() as i32 + 16,
        text_offset.1 as i32,
        64.0,
        Rgba([255, 255, 255, 255]),
    );
    overlay(
        &mut image,
        &icons.area,
        text_offset.0 as i64,
        area_icon_y as i64,
    );

    Ok(image)
}

fn generate_entry(
    paths: &Paths,
    font: &Fonts,
    icons: &Icons,
    city: &City,
) -> AppResult<ImageBuffer<Rgba<u8>, Vec<u8>>> {
    let filename = format!("{}.webp", format_file_name(city));
    let background_path = paths.edited_backgrounds.join(&filename);
    let mut image = image::open(background_path)?.to_rgba8();
    let img_height = image.height() as i32;
    let img_width = image.width() as i32;

    let coa_path = paths.edited_coas.join(filename);
    let coa = image::open(coa_path)?.to_rgba8();
    let coa_width = coa.width() as i32;
    let coa_height = coa.height() as i32;
    let coa_y = img_height / 2 - coa_height / 2;
    overlay(&mut image, &coa, 32, coa_y as i64);

    let text_offset = 64 + coa_width;

    let name_text_size = text_size(PxScale::from(80.0), &font.bold, &city.name);
    draw_text(
        &mut image,
        &city.name,
        &font.bold,
        text_offset,
        img_height / 2 - name_text_size.1 as i32 - 8,
        80.0,
        Rgba([255, 255, 255, 255]),
    );

    draw_text(
        &mut image,
        &format!("powiat {}", &city.powiat),
        &font.regular,
        text_offset,
        img_height / 2 + 8,
        48.0,
        Rgba([200, 200, 200, 255]),
    );

    let population_text = format!("{} ({}/km²)", city.total_population, city.population_per_km);
    let population_text_size = text_size(PxScale::from(48.0), &font.regular, &population_text);
    let population_x = img_width - 32 - population_text_size.0 as i32;
    let population_y = img_height / 2 - population_text_size.1 as i32 - 16;
    let population_icon_y =
        population_y - (icons.population.height() as i32 / 2) + (population_text_size.1 as i32 / 2);

    let area_text = format!("{} km² ({} ha)", city.area_km, city.area_ha);
    let area_text_size = text_size(PxScale::from(48.0), &font.regular, &area_text);
    let area_x = img_width - 32 - area_text_size.0 as i32;
    let area_y = img_height / 2 + 16;
    let area_icon_y = area_y - (icons.area.height() as i32 / 2) + (area_text_size.1 as i32 / 2);

    draw_text(
        &mut image,
        &population_text,
        &font.regular,
        population_x,
        population_y,
        48.0,
        Rgba([255, 255, 255, 255]),
    );
    overlay(
        &mut image,
        &icons.population,
        population_x.min(area_x) as i64 - icons.population.width() as i64 - 16,
        population_icon_y as i64,
    );

    draw_text(
        &mut image,
        &area_text,
        &font.regular,
        area_x,
        area_y,
        48.0,
        Rgba([255, 255, 255, 255]),
    );
    overlay(
        &mut image,
        &icons.area,
        population_x.min(area_x) as i64 - icons.area.width() as i64 - 16,
        area_icon_y as i64,
    );

    Ok(image)
}

fn generate_slide(
    paths: &Paths,
    font: &Fonts,
    icons: &Icons,
    cities: &[City],
) -> AppResult<ImageBuffer<Rgba<u8>, Vec<u8>>> {
    let entries = cities
        .iter()
        .map(|city| generate_entry(paths, font, icons, city))
        .collect::<AppResult<Vec<_>>>()?;

    let mut canvas = ImageBuffer::from_pixel(1920, 1080, Rgba([0, 0, 0, 255]));

    for (i, entry) in entries.iter().enumerate() {
        overlay(&mut canvas, entry, 0, i as i64 * 270);
    }

    Ok(canvas)
}

pub fn generate_slides(paths: &Paths, dataset: &[Voivodeship]) -> AppResult<ReturnReport> {
    let start_time = std::time::Instant::now();
    ensure_exists(&paths.slides)?;

    log!([LogStyle::Blue], "PRES GEN", "Loading fonts...");

    let regular_font_data = read(paths.fonts.join("BonaNova-Regular.ttf"))?;
    let bold_font_data = read(paths.fonts.join("BonaNova-Bold.ttf"))?;

    let fonts = Fonts {
        regular: FontRef::try_from_slice(&regular_font_data)?,
        bold: FontRef::try_from_slice(&bold_font_data)?,
    };

    log!([LogStyle::Blue], "PRES GEN", "Loading icons...");

    let home_icon = image::open(paths.icons.join("home.png"))?;
    let area_icon = image::open(paths.icons.join("area.png"))?;
    let population_icon = image::open(paths.icons.join("population.png"))?;

    let icons = Icons {
        home: home_icon.to_rgba8(),
        area: area_icon.to_rgba8(),
        population: population_icon.to_rgba8(),
    };

    let mut amount_ok = 0;
    let mut slide_number = 0;

    for (voivodeship_idx, voivodeship) in dataset.iter().enumerate() {
        log!(
            [LogStyle::Blue, LogStyle::Bold],
            &format!(
                "PRES GEN{:>7}",
                format!("{voivodeship_idx}/{VOIVODESHIP_COUNT}")
            ),
            "Processing voivodeship: {}",
            voivodeship.name
        );

        slide_number += 1;

        let slide = generate_title(&fonts, &voivodeship.name)?;
        let slide_filename = format!("{}_{}.webp", amount_ok, voivodeship.name);
        let slide_path = paths.slides.join(slide_filename);
        slide.save_with_format(slide_path, ImageFormat::WebP)?;

        let slide = generate_map_slide(&paths, &fonts, &icons, &voivodeship)?;
        let slide_filename = format!("{}_{}_0.webp", amount_ok, voivodeship.name);
        let slide_path = paths.slides.join(slide_filename);
        slide.save_with_format(slide_path, ImageFormat::WebP)?;

        for (slide_index, city_chunk) in voivodeship.content.chunks(4).enumerate() {
            slide_number += 1;

            let mut slide = generate_slide(paths, &fonts, &icons, city_chunk)?;
            // add slide numbers
            let slide_number_str = slide_number.to_string();
            let (width, height) = text_size(PxScale::from(48.0), &fonts.bold, &slide_number_str);
            let x = slide.width() - width - 32;
            let y = slide.height() - height - 32;
            draw_text(
                &mut slide,
                &slide_number_str,
                &fonts.regular,
                x as i32,
                y as i32,
                48.0,
                Rgba([255, 255, 255, 255]),
            );

            let slide_filename = format!(
                "{}_{}_{}.webp",
                amount_ok,
                voivodeship.name,
                slide_index + 1
            );
            let slide_path = paths.slides.join(slide_filename);
            slide.save_with_format(slide_path, ImageFormat::WebP)?;

            log!(
                [LogStyle::Green],
                "PRES GEN",
                "Generated slide {slide_index} for {}",
                voivodeship.name
            );
        }

        amount_ok += 1;
    }

    log!([LogStyle::Blue], "PRES GEN", "Generating title slide");

    let path = paths.data.join("credits.txt");

    if !path.exists() {
        File::create(&path)?;
    }

    let credits_raw = std::fs::read_to_string(path)?;
    let credits = credits_raw.trim();

    let mut image = ImageBuffer::from_pixel(1920, 1080, Rgba([0, 0, 0, 255]));
    let text = "Podział Administracyjny Polski";

    let (width, height) = text_size(PxScale::from(140.0), &fonts.bold, text);
    let x = image.width() / 2 - width / 2;
    let y = image.height() / 2 - height / 2;

    draw_text(
        &mut image,
        text,
        &fonts.bold,
        x as i32,
        y as i32,
        140.0,
        Rgba([240, 240, 240, 255]),
    );

    let (width, height) = text_size(PxScale::from(32.0), &fonts.regular, credits);
    let x = image.width() - 32 - width;
    let y = image.height() - 32 - height;

    draw_text(
        &mut image,
        credits,
        &fonts.regular,
        x as i32,
        y as i32,
        32.0,
        Rgba([255, 255, 255, 255]),
    );

    let slide_path = paths.slides.join("title.webp");
    image.save_with_format(slide_path, ImageFormat::WebP)?;

    Ok(ReturnReport {
        job_name: "PRES GEN".into(),
        duration: start_time.elapsed(),
        amount_ok,
        amount_err: VOIVODESHIP_COUNT - amount_ok,
    })
}
