import { readdir, writeFile } from "node:fs/promises";
import { join, parse as parsePath } from "node:path";
import sharp from "sharp";

import { paths } from ".";
import { cityHeight, cityWidth } from "./config";
import { log, LogStyle, timeEnd, timeStart } from "./logger";
import { formatFileName } from "./wiki-scraper";
import { ensureExists } from "./utils";
import type { City, Map, Voivodeship } from "./types";

interface EditImageOptions {
    brightness: number;
    blurness: number;
}

const brightness = 0.5;
const blurness = 5;

async function editBackground(
    city: City,
    URL: string,
    options: EditImageOptions = { brightness, blurness }
) {
    const canvas = sharp({
        create: {
            width: cityWidth,
            height: cityHeight - 4,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 }
        }
    });

    let image = sharp(URL);

    if (options.brightness !== 0) {
        image = image.modulate({ brightness: options.brightness });
    }

    if (options.blurness > 0) {
        image = image.blur(options.blurness);
    }

    const metadata = await image.metadata();

    if (!metadata)
        throw new Error("Undefined image metadata");

    if (!metadata.height)
        throw new Error("Undefined image height");

    if (!metadata.width)
        throw new Error("Undefined image width");

    const aspectRatio = metadata.height / metadata.width;

    const newHeight = aspectRatio * cityWidth;

    const top = newHeight / 2 < cityHeight
        ? 0
        : Math.round(newHeight / 2);

    image = image.resize(cityWidth, Math.round(Math.max(newHeight, cityHeight)));

    log(
        [LogStyle.purple],
        "VERBOSE",
        `Processing image ${URL}\nAspect ratio: ${aspectRatio.toFixed(2)}\nCalculated height: ${newHeight}\nTop padding: ${Math.round(newHeight / 2)}`
    );

    image = image.extract({
        height: cityHeight - 4,
        width: cityWidth,
        top, left: 0
    });

    const imageBuffer = await image.toBuffer();
    const compositeImage = await canvas
        .composite([{ input: imageBuffer, gravity: "west" }])
        .extend({
            top: 2,
            bottom: 2,
            background: "#FFFFFF"
        })
        .webp({ quality: 100 })
        .toBuffer();

    await writeFile(
        join(paths.editedBackgrounds, formatFileName(city) + ".webp"),
        compositeImage
    );
}

export async function editBackgrounds(voivodeships: Map<Voivodeship>) {
    timeStart("imageEditor");
    log([LogStyle.blue, LogStyle.bold], "IMAGE EDITOR", "Preparing files");

    const voivodeshipNames = Object.keys(voivodeships);

    await ensureExists(paths.backgrounds);
    await ensureExists(paths.editedBackgrounds);

    let cities = voivodeshipNames.flatMap(voivodeship =>
        voivodeships[voivodeship].map(city => ({
            ...city,
            voivodeship
        }))
    ) as (City & { voivodeship: string })[];

    let backgroundFiles: string[] = [];
    let editedFiles: string[] = [];

    try {
        editedFiles = await readdir(paths.editedBackgrounds);

        const editedNames = editedFiles.map(file => parsePath(file).name);
        cities = cities.filter(city => {
            const formatted = formatFileName(city);
            return !editedNames.includes(formatted);
        });
    } catch (err) {
        log(
            [LogStyle.red, LogStyle.bold],
            "ERROR",
            "Failed to read edited backgrounds directory",
            err
        );
    }

    try {
        backgroundFiles = await readdir(paths.backgrounds);
    } catch (err) {
        log(
            [LogStyle.red, LogStyle.bold],
            "ERROR",
            "Failed to read backgrounds directory",
            err
        );
    }

    log([LogStyle.blue, LogStyle.bold], "IMAGE EDITOR", "Editing images");

    let processed = 0;
    const tasks = [];

    for await (const city of cities) {
        const fileName = backgroundFiles
            .find(fileName => fileName.startsWith(formatFileName(city)));

        if (!fileName) {
            log(
                [LogStyle.red, LogStyle.bold],
                "ERROR",
                `Background file for ${city.name} not found`
            );
            continue;
        }

        const filePath = join(paths.backgrounds, fileName);

        tasks.push(
            editBackground(city, filePath).then(function() {
                log(
                    [LogStyle.purple],
                    `EDIT${(Math.floor((++processed / cities.length) * 100).toString() + "%").padStart(11, " ")}`,
                    `Processed image "${filePath}"`
                );
            }).catch(function(err) {
                log(
                    [LogStyle.bold, LogStyle.red],
                    "ERROR",
                    `Error while preparing background: ${city.name}`,
                    err
                );
            })
        );
    }

    await Promise.all(tasks);

    log(
        [LogStyle.blue, LogStyle.bold],
        "IMAGE EDITOR", `Processed ${cities.length} images`
    );
    timeEnd("imageEditor");
};
