import { join } from "node:path";
import { Jimp } from "jimp";
import { downloadsPath, formatFileName } from "./wiki-scraper";
import { LogStyle, log } from "./logger";
import type { City } from "./types";

const brightness = 0.6;
const blurness = 5;

async function editImage(URL: string, city: City) {
    // 10 inches at 96 dpi is 960px, 1.125 inches at 96 dpi is 108px;
    const canvas = new Jimp({ width: 960, height: 108, color: 0x000000ff });

    const image = await Jimp.read(URL);

    image.brightness(brightness);
    image.blur(blurness);

    const aspectRatio = image.width / image.height;
    const newWidth = aspectRatio * canvas.height;

    image.resize({ w: newWidth, h: canvas.height });
    
    const times = Math.round(canvas.width / newWidth);

    for (let i = 0; i < times; i++) {
	image.flip({ horizontal: true, vertical: false });

    	canvas.composite(image, i * newWidth, 0);
    }

    return canvas.write(join(downloadsPath, formatFileName(city, "-panorama")));
}

