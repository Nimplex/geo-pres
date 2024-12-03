import { Jimp } from "jimp";

interface EditImageOptions {
    brightness: number;
    blurness: number;
}

const brightness = 0.6;
const blurness = 5;

/**
 * Edits an image by applying brightness and blur effects, resizing it, 
 * and repeatedly compositing it onto a canvas with horizontal flipping.
 *
 * @async
 * @function editImage
 * @param {string} URL - The URL or path to the image to be edited.
 * @param {EditImageOptions} [options] - Optional settings for editing the image.
 * @param {number} [options.brightness=0] - The brightness adjustment to apply to the image (range: -1 to 1).
 * @param {number} [options.blurness=0] - The amount of blur to apply to the image.
 * @returns {Promise<Buffer>} - A promise that resolves to a Buffer containing the edited image in PNG format.
 *
 * @typedef {Object} EditImageOptions
 * @property {number} [brightness=0] - The brightness adjustment (range: -1 to 1).
 * @property {number} [blurness=0] - The amount of blur to apply.
 *
 * @throws {Error} - Throws an error if the image cannot be read or processed.
 *
 * @example
 * const options = { brightness: 0.2, blurness: 5 };
 * const editedImageBuffer = await editImage("https://example.com/image.png", options);
 * // Use the buffer to save the image, send it over the network, etc.
 */
async function editImage(URL: string, options: EditImageOptions = { brightness, blurness }) {
    // 10 inches at 96 dpi is 960px, 1.125 inches at 96 dpi is 108px;
    const canvas = new Jimp({ width: 960, height: 108, color: 0x000000ff });

    const image = await Jimp.read(URL);

    image.brightness(options.brightness);
    image.blur(options.blurness);

    const aspectRatio = image.width / image.height;
    const newWidth = aspectRatio * canvas.height;

    image.resize({ w: newWidth, h: canvas.height });
    
    const times = Math.round(canvas.width / newWidth);

    for (let i = 0; i < times; i++) {
        image.flip({ horizontal: true, vertical: false });

        canvas.composite(image, i * newWidth, 0);
    }

    return image.getBuffer("image/png");
}