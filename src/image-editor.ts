import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs"; 
import { join } from "node:path";
import { downloadsPathBackgrounds, formatFileName } from "./wiki-scraper";
import { log, LogStyle } from "./logger";
import type { City, Map, Voivodeship } from "./types";

interface EditImageOptions {
    brightness: number;
    blurness: number;
}

const brightness = 0.5;
const blurness = 5;

async function prepareBackground(URL: string, options: EditImageOptions = { brightness, blurness }) {
    const width = 1920;
    const height = 212;

    const canvas = sharp({
        create: {
            width,
            height,
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

    const offsetWidth = 1670;
    const newHeight = aspectRatio * offsetWidth;

    const top = newHeight / 2 < height ? 0 : Math.round(newHeight / 2);

    image = image.resize(offsetWidth, Math.round(Math.max(newHeight, height)));

    log([LogStyle.purple], "VERBOSE", `canvas height: ${height}, canvas width: ${width}, offset width: ${offsetWidth}, offsetted height: ${newHeight}, aspect ratio: ${aspectRatio.toFixed(2)}, top padding: ${Math.round(newHeight / 2)}`);

    image = image.extract({ height, width: offsetWidth, top, left: 0 });

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

    return compositeImage
}

export async function editBackgrounds(voivodeships: Map<Voivodeship>) {
    let cities = Object.keys(voivodeships).map(voivode => voivodeships[voivode].map(city => Object.assign(city, { voivodeship: voivode }))).flat();
    let backgroundFiles: string[] = [];

    try {
        backgroundFiles = readdirSync(downloadsPathBackgrounds);
        cities = cities.filter(city => !backgroundFiles.includes(formatFileName(city, ".edited.webp")));
    } catch (err) {
        log([LogStyle.red, LogStyle.bold], "ERROR", `Couldn't read downloads directory for existing files: ${err}`);
    }

    let processed = 0;
    const tasks = [];

    for await (const city of cities) {
        async function task(city: City) {
            const fileName = backgroundFiles.find(fileName => fileName.startsWith(formatFileName(city)));

            if (!fileName) {
                log([LogStyle.red, LogStyle.bold], "ERROR", `Background file for ${city.name} not found`);
                return;
            }

            const filePath = join(downloadsPathBackgrounds, fileName);

            let editedImage = undefined;

            try {
                editedImage = await prepareBackground(filePath);
            } catch(err) {
                log([LogStyle.bold, LogStyle.red], "ERROR", `Error while preparing background: ${city.name}: ${err}`);
            }

            if (!editedImage) return;

            log([LogStyle.purple], `EDIT${(Math.floor((++processed / cities.length) * 100).toString() + "%").padStart(11, " ")}`, `Processed image '${filePath}'`);

            await writeFile(join(downloadsPathBackgrounds, formatFileName(city, ".edited.webp")), Buffer.from(editedImage));
        }

        tasks.push(task(city))
    }

    await Promise.all(tasks);

    log([LogStyle.green], "EDIT", `Processed ${cities.length} images`);
};
