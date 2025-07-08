import sharp from "sharp";
import { readdir, writeFile } from "node:fs/promises";
import { join, parse as parsePath } from "node:path";
import { exit } from "node:process";

import { paths } from ".";
import { cityHeight, cityWidth } from "./config";
import { log, LogStyle, timeStart, timeEnd } from "./logger";
import { formatFileName } from "./wiki-scraper";
import { ensureExists } from "./utils";
import type { City, Map, Voivodeship } from "./types";

const brightness = 0.5;
const blurness = 5;

interface EditImageOptions {
    brightness: number;
    blurness: number;
}

async function editBackground(
    city: City,
    inputPath: string,
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

    let image = sharp(inputPath);

    if (options.brightness !== 0) {
        image = image.modulate({ brightness: options.brightness });
    }

    if (options.blurness > 0) {
        image = image.blur(options.blurness);
    }

    const metadata = await image.metadata();
    if (!metadata?.height || !metadata?.width)
        throw new Error(`Missing metadata for image: ${inputPath}`);

    const aspectRatio = metadata.height / metadata.width;
    const newHeight = aspectRatio * cityWidth;
    const top = newHeight / 2 < cityHeight ? 0 : Math.round(newHeight / 2);

    image = image
        .resize(cityWidth, Math.round(Math.max(newHeight, cityHeight)))
        .extract({
            height: cityHeight - 4,
            width: cityWidth,
            top,
            left: 0
        });

    const buffer = await image.toBuffer();

    const final = await canvas
        .composite([{ input: buffer }])
        .extend({ top: 2, bottom: 2, background: "#FFFFFF" })
        .webp({ quality: 100 })
        .toBuffer();

    await writeFile(
        join(paths.editedBackgrounds, formatFileName(city) + ".webp"),
        final
    );
}

async function editCOA(city: City, inputPath: string) {
    const outputPath = join(paths.editedCOA, formatFileName(city) + ".png");

    let image = sharp(inputPath);

    if (parsePath(inputPath).ext.toLowerCase() == ".jpg") {
        log(
            [LogStyle.yellow],
            "EDIT_COA",
            `Detected .jpg file, converting to png: ${city.name}`
        );
    }

    const buffer = await image.png().toBuffer();

    await writeFile(outputPath, buffer);
}

export async function editAssets(voivodeships: Map<Voivodeship>) {
    timeStart("iamgeEditor");

    await ensureExists(paths.backgrounds);
    await ensureExists(paths.editedBackgrounds);
    await ensureExists(paths.COA);
    await ensureExists(paths.editedCOA);

    const cities = Object
        .entries(voivodeships)
        .flatMap(([voivodeship, cities]) =>
            cities.map(city => ({ ...city, voivodeship }))
        );

    let backgroundFiles: string[] = [];
    let editedBackgrounds: Set<string> = new Set();
    let coaFiles: string[] = [];
    let editedCOAs: Set<string> = new Set();

    try {
        backgroundFiles = await readdir(paths.backgrounds);
        editedBackgrounds = new Set(
            (await readdir(paths.editedBackgrounds)
        ).map(f => parsePath(f).name));
    } catch (err) {
        log(
            [LogStyle.red, LogStyle.bold],
            "ERROR",
            "Failed to read background directories",
            err
        );
        exit(1);
    }

    try {
        coaFiles = await readdir(paths.COA);
        editedCOAs = new Set(
            (await readdir(paths.editedCOA)
        ).map(f => parsePath(f).name));
    } catch (err) {
        log(
            [LogStyle.red, LogStyle.bold],
            "ERROR",
            "Failed to read COA directories",
            err
        );
        exit(1);
    }

    const backgroundTasks: Promise<void>[] = [];
    const coaTasks: Promise<void>[] = [];

    let processedBg = 0;
    let processedCoa = 0;

    for (const city of cities) {
        const cityFileName = formatFileName(city);

        if (!editedBackgrounds.has(cityFileName)) {
            const backgroundFile = backgroundFiles
                .find(f => f.startsWith(cityFileName));
            if (!backgroundFile) {
                log(
                    [LogStyle.yellow],
                    "WARN",
                    `No background for ${city.name}, skipping`
                );
            } else {
                const inputPath = join(paths.backgrounds, backgroundFile);
                backgroundTasks.push(
                    editBackground(city, inputPath).then(() => {
                        log(
                            [LogStyle.purple],
                            `EDIT_BG ${(++processedBg).toString().padStart(7, " ")}`,
                            `Processed: ${city.name}`
                        );
                    }).catch(err => {
                        log(
                            [LogStyle.red],
                            "ERROR",
                            `Failed editing background: ${city.name}`,
                            err
                        );
                    })
                );
            }
        }

        if (!editedCOAs.has(cityFileName)) {
            const coaFile = coaFiles.find(f => f.startsWith(cityFileName));
            if (!coaFile) {
                log(
                    [LogStyle.yellow],
                    "WARN",
                    `No COA for ${city.name}, skipping`
                );
            } else {
                const inputPath = join(paths.COA, coaFile);
                coaTasks.push(
                    editCOA(city, inputPath).then(() => {
                        log(
                            [LogStyle.cyan],
                            `EDIT_COA ${(++processedCoa).toString().padStart(6, " ")}`,
                            `Processed: ${city.name}`
                        );
                    }).catch(err => {
                        log(
                            [LogStyle.red],
                            "ERROR",
                            `Failed editing COA: ${city.name}`,
                            err
                        );
                    })
                );
            }
        }
    }

    await Promise.all([...backgroundTasks, ...coaTasks]);

    log(
        [LogStyle.blue, LogStyle.bold],
        "IMAGE EDITOR",
        `Processed ${processedBg.toString().green()}/${cities.length} backgrounds and ${processedCoa.toString().green()}/${cities.length} COAs`
    );
    timeEnd("iamgeEditor");
}
