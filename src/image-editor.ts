import { Jimp } from "jimp";
import { writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs"; 
import { join } from "node:path";
import { downloadsPathBackgrounds, formatFileName } from "./wiki-scraper";
import { log, LogStyle } from "./logger";
import type { Map, Voivodeship } from "./types";

interface EditImageOptions {
    brightness: number;
    blurness: number;
}

const brightness = 0.5;
const blurness = 0;

async function prepareBackground(URL: string, options: EditImageOptions = { brightness, blurness }) {
    // 10 inches at 192 dpi is 1920px, 1.125 inches at 192 dpi is 216px;
    const canvas = new Jimp({ width: 1920, height: 216 });
    const image = await Jimp.read(URL);

    image.brightness(options.brightness);
    if (options.blurness > 0)
        image.blur(options.blurness);

    const aspectRatio = image.height / image.width;

    // leave some space for coats of arms, (10 - leftMargin * 2 - imageWidth) * 192 dpi
    const offsetWidth = 1670;
    const newHeight = aspectRatio * offsetWidth;

    image.resize({ w: offsetWidth, h: newHeight });

    canvas.composite(image, 0, (newHeight / 2) * -1);

    return canvas.getBuffer("image/png");
}

export async function editBackgrounds(voivodeships: Map<Voivodeship>) {
    let cities = Object.keys(voivodeships).map(voivode => voivodeships[voivode].map(city => Object.assign(city, { voivodeship: voivode }))).flat();
 
    try {
        const backgroundFiles = readdirSync(downloadsPathBackgrounds);
        cities = cities.filter(city => !backgroundFiles.includes(formatFileName(city, ".edited.png")));
    } catch (err) {
        log([LogStyle.red, LogStyle.bold], "ERROR", `Couldn't read downloads directory for existing files: ${err}`);
    }

    cities.forEach(async city => {
        const fileName = join(downloadsPathBackgrounds, formatFileName(city, ".png"));
        const editedImage = await prepareBackground(fileName);

	log([LogStyle.purple], "EDIT", `Processed image "${fileName}"`);

	return await writeFile(join(downloadsPathBackgrounds, formatFileName(city, ".edited.png")), Buffer.from(editedImage));
    });

    log([LogStyle.green], "EDIT", `Processed ${cities.length} images`);
};
