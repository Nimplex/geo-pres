import sharp from "sharp";
import { join } from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { exit } from "node:process";
import TextToSVG from "text-to-svg";

import { paths } from ".";
import { formatFileName } from "./wiki-scraper";
import { log, LogStyle, timeEnd, timeStart } from "./logger";
import { ensureExists } from "./utils";
import {
    citiesPerSlide,
    cityHeight,
    cityWidth,
    slideHeight,
    slideWidth
} from "./config";
import type { City, Map, Voivodeship } from "./types";

log([LogStyle.purple], "VERBOSE", "Loading TextToSVG");
const textToSVG = TextToSVG.loadSync();

function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size)
        result.push(arr.slice(i, i + size));
    return result;
}

export async function generateSlide(
    cities: City[],
    index: number,
    voivodeshipName: string,
    coaFiles: string[]
) {
    const slide = sharp({
        create: {
            width: slideWidth,
            height: slideHeight,
            channels: 4,
            background: "#FEFEFE"
        }
    });

    const slideComposites: sharp.OverlayOptions[] = [];

    for (const [i, city] of cities.entries()) {
        const yOffset = i * cityHeight;

        const entry = sharp({
            create: {
                width: cityWidth,
                height: cityHeight,
                channels: 4,
                background: "#000"
            }
        });

        const entryComposites: sharp.OverlayOptions[] = [];

        try {
            const backgroundPath = join(
                paths.editedBackgrounds,
                formatFileName(city) + ".webp"
            );
            const bgBuffer = await readFile(backgroundPath);
            entryComposites.push({ input: bgBuffer, top: 0, left: 0 });
        } catch (err) {
            log(
                [LogStyle.red, LogStyle.bold],
                "ERROR",
                `Missing background for: ${city.name}, skipping`
            );
            continue;
        }

        const coaFile = coaFiles
            .find(file => file.startsWith(formatFileName(city)));
        if (!coaFile) {
            log(
                [LogStyle.red, LogStyle.bold],
                "ERROR",
                `No COA for: ${city.name}, skipping`
            );
            continue;
        }

        try {
            const coaPath = join(paths.COA, coaFile);
            const coaBuffer = await readFile(coaPath);
            const resized = await sharp(coaBuffer)
                .resize({ height: 184 })
                .png()
                .toBuffer();
            const { width = 0 } = await sharp(resized).metadata();
            entryComposites.push({
                input: resized,
                top: (cityHeight - 184) / 2,
                left: Math.round(cityWidth - 125 - (width / 2))
            });
        } catch {
            log(
                [LogStyle.bold, LogStyle.red],
                "ERROR",
                `Failed to read/resize COA for ${city.name}`
            );
            continue;
        }

        const labelGroups = [
            { text: city.name, size: 48 },
            { text: city.powiat, size: 32 },
            { text: `${city.totalPopulation} (całkowita)`, size: 32 },
            { text: `${city.populationPerKm} (osób/km^2)`, size: 32 },
            { text: `${city.areaKm} km^2`, size: 32 },
        ];

        let leftOffset = 100;

        for (const { text, size } of labelGroups) {
            const metrics = textToSVG.getMetrics(text, {
                fontSize: size,
                anchor: "top"
            });
            const d = textToSVG.getD(text, {
                fontSize: size,
                anchor: "top",
                attributes: { fill: "white" }
            });
            entryComposites.push({
                input: Buffer.from(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="${metrics.width}" height="${metrics.height}" viewBox="0 0 ${metrics.width} ${metrics.height}">
                        <path d="${d}" fill="white"/>
                    </svg>
                `.trim()),
                top: Math.round((cityHeight - metrics.height) / 2),
                left: leftOffset
            });
            leftOffset += metrics.width + 32;
        }

        try {
            const entryBuffer = await entry
                .composite(entryComposites)
                .png()
                .toBuffer();
            slideComposites.push({ input: entryBuffer, top: yOffset, left: 0 });
        } catch (err) {
            log(
                [LogStyle.red, LogStyle.bold],
                "ERROR",
                `Failed while composing entry buffer for: ${city.name}`,
                err
            );
        }
    }

    let buffer = null;

    try {
        buffer = await slide.composite(slideComposites).png().toBuffer();
    } catch (err) {
        log(
            [LogStyle.red, LogStyle.bold],
            "ERROR",
            `Failed while composing slide buffer for: ${cities.map(({ name }) => name).join(", ")}`,
            err
        );
    }

    if (!buffer) return;

    const filePath = join(paths.slides, `${voivodeshipName}.${index}.png`);

    try {
        await writeFile(filePath, buffer);
    } catch (err) {
        log(
            [LogStyle.red, LogStyle.bold],
            "ERROR",
            `Failed to save slide\nfile path: ${filePath}`
        );
    }
}

export async function generatePresentation(voivodeships: Map<Voivodeship>) {
    timeStart("presgen");
    log([LogStyle.blue], "PRESGEN", "Preparing files");
    await ensureExists(paths.slides);

    log([LogStyle.purple], "VERBOSE", `Reading COA directory "${paths.COA}"`);

    let coaFiles: string[] = [];

    try {
        coaFiles = await readdir(paths.COA);
    } catch (err) {
        log(
            [LogStyle.red, LogStyle.bold],
            "ERROR", `Couldn't read COA directory`,
            err
        );
        exit(1);
    }

    log([LogStyle.blue], "PRESGEN", "Generating slides");
    const tasks = [];

    for (const voivodeshipName of Object.keys(voivodeships)) {
        const cityChunks = chunk(voivodeships[voivodeshipName], citiesPerSlide);

        for (const [chunkIndex, cities] of cityChunks.entries()) {
            tasks.push(
                generateSlide(cities, chunkIndex, voivodeshipName, coaFiles)
                    .then(function() {
                        log(
                            [LogStyle.cyan],
                            "PRESGEN",
                            `Processed ${cities.map(({ name }) => name).join(", ")} (${voivodeshipName}.${chunkIndex}.png)`
                        );
                    }).catch(function(err) {
                        log(
                            [LogStyle.bold, LogStyle.red],
                            "ERROR",
                            `Error while generating slide: ${cities.map(({ name }) => name).join(", ")}`,
                            err
                        );
                    })
            );
        }
    }

    await Promise.all(tasks);
    log([LogStyle.blue], "PRESGEN", "Generated all slides");
    timeEnd("presgen");
}
