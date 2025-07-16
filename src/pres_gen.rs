use std::{cmp, fs::read};

use ab_glyph::{FontArc, PxScale};
use image::{ImageBuffer, ImageFormat, Rgba, RgbaImage, imageops::overlay};
use imageproc::drawing::{draw_text_mut, text_size};

use crate::{
    log,
    logger::{LogStyle, log_msg},
    parser::{City, Voivodeship},
    paths::Paths,
    utils::{AppResult, ensure_exists, format_file_name},
};

struct Fonts {
    regular: FontArc,
    bold: FontArc,
}

struct Icons {
    population: ImageBuffer<Rgba<u8>, Vec<u8>>,
    area: ImageBuffer<Rgba<u8>, Vec<u8>>,
}

fn draw_text(
    img: &mut RgbaImage,
    text: &str,
    font: &FontArc,
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
                    Rgba([0, 0, 0, 255u8]),
                    x + dx,
                    y + dy,
                    scale,
                    font,
                    text,
                );
            }
        }
    }

    draw_text_mut(img, color, x, y, scale, font, text);

    text_size(scale, font, text)
}

fn generate_entry(
    paths: &Paths,
    font: &Fonts,
    icons: &Icons,
    city: &City,
) -> AppResult<ImageBuffer<Rgba<u8>, Vec<u8>>> {
    let background_filename = format!("{}.webp", format_file_name(city));
    let background_path = paths.edited_backgrounds.join(background_filename);
    let mut image = image::open(background_path)?.to_rgba8();

    let (_, height) = draw_text(
        &mut image,
        &city.name,
        &font.bold,
        32,
        32,
        80f32,
        Rgba([255u8, 255u8, 255u8, 255u8]),
    );

    draw_text(
        &mut image,
        format!("pow. {}", &city.powiat).as_str(),
        &font.regular,
        32,
        32 * 2 + height as i32,
        48f32,
        Rgba([200u8, 200u8, 200u8, 255u8]),
    );

    let img_width = image.width() as i32;

    let population_text = format!("{} ({}/km²)", city.total_population, city.population_per_km);
    let population_text_size = text_size(PxScale::from(48f32), &font.regular, &population_text);
    let population_x = img_width - 32 - population_text_size.0 as i32;
    let population_y = 32;
    let population_icon_y =
        population_y - (icons.population.height() as i32 / 2) + (population_text_size.1 / 2) as i32;

    let area_text = format!("{} km² ({} ha)", city.area_km, city.area_ha);
    let area_text_size = text_size(PxScale::from(48f32), &font.regular, &area_text);
    let area_x = img_width - 32 - area_text_size.0 as i32;
    let area_y = population_y + population_text_size.1 as i32 + 32;
    let area_icon_y = area_y - (icons.area.height() as i32 / 2) + (area_text_size.1 / 2) as i32;

    draw_text(
        &mut image,
        &population_text,
        &font.regular,
        population_x,
        population_y as i32,
        48f32,
        Rgba([255u8, 255u8, 255u8, 255u8]),
    );
    overlay(
        &mut image,
        &icons.population,
        cmp::min(population_x, area_x) as i64 - icons.population.width() as i64 - 16 as i64,
        population_icon_y as i64,
    );

    draw_text(
        &mut image,
        &area_text,
        &font.regular,
        area_x,
        area_y as i32,
        48f32,
        Rgba([255u8, 255u8, 255u8, 255u8]),
    );
    overlay(
        &mut image,
        &icons.area,
        cmp::min(population_x, area_x) as i64 - icons.area.width() as i64 - 16 as i64,
        area_icon_y as i64,
    );

    Ok(image)
}

pub fn generate_slides(paths: &Paths, dataset: &[Voivodeship]) -> AppResult<()> {
    ensure_exists(&paths.slides).unwrap();

    log!([LogStyle::Purple], "PRES_GEN", "{}", "Loading fonts");

    let regular_font_data = read(paths.fonts.join("BonaNova-Regular.ttf"))?;
    let bold_font_data = read(paths.fonts.join("BonaNova-Bold.ttf"))?;

    let fonts = Fonts {
        regular: FontArc::try_from_vec(regular_font_data).expect("Couldn't load regular font"),
        bold: FontArc::try_from_vec(bold_font_data).expect("Couldn't load bold font"),
    };

    log!([LogStyle::Purple], "PRES_GEN", "{}", "Loading icons");

    let area_icon = image::open(paths.icons.join("area.png"))?;
    let population_icon = image::open(paths.icons.join("population.png"))?;

    let icons = Icons {
        area: area_icon.to_rgba8(),
        population: population_icon.to_rgba8(),
    };

    for voivodeship in dataset.iter() {
        for city in voivodeship.content.iter() {
            let file_name = format!("{}.webp", format_file_name(city));
            let file_path = paths.slides.join(file_name);
            let entry = generate_entry(paths, &fonts, &icons, &city)?;
            entry.save_with_format(file_path, ImageFormat::WebP)?;
        }
    }

    Ok(())
}
