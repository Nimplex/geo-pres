import { Jimp } from "jimp";
import { writeFile } from "node:fs/promises";

interface EditImageOptions {
    brightness: number;
    blurness: number;
}

const brightness = 0.5;
const blurness = 1;

async function prepareBackground(URL: string, options: EditImageOptions = { brightness, blurness }) {
    // 10 inches at 192 dpi is 1920px, 1.125 inches at 192 dpi is 216px;
    const canvas = new Jimp({ width: 1920, height: 216 });
    const image = await Jimp.read(URL);

    image.brightness(options.brightness);
    image.blur(options.blurness);

    const aspectRatio = image.height / image.width;

    // leave some space for coats of arms, (10 - leftMargin * 2 - imageWidth) * 192 dpi
    const offsetWidth = 1670;
    const newHeight = aspectRatio * offsetWidth;

    image.resize({ w: offsetWidth, h: newHeight });

    canvas.composite(image, 0, (newHeight / 2) * -1);

    return canvas.getBuffer("image/png");
}