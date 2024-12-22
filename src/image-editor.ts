import sharp from "sharp";
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
const blurness = 3;

async function prepareBackground(URL: string, options: EditImageOptions = { brightness, blurness }) {
    const width = 1920;
    const height = 216;

    // Create a blank canvas (transparent background)
    const canvas = sharp({
        create: {
	    width, 
	    height,
	    channels: 4,  // RGBA
	    background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
	}
    });

    // Load the image from the URL (or local file)
    let image = sharp(URL);

    // Apply brightness and blur if necessary
    if (options.brightness !== 0) {
	image = image.modulate({ brightness: options.brightness });
    }

    if (options.blurness > 0) {
	image = image.blur(options.blurness);
    }

    // Get image metadata (for aspect ratio)
    const metadata = await image.metadata();

    if (!metadata)
	throw new Error("Undefined image metadata");

    if (!metadata.height)
	throw new Error("Undefined image height");

    if (!metadata.width)
        throw new Error("Undefined image width");

    const aspectRatio = metadata.height / metadata.width;

    // Define offsetWidth and calculate the new height for the image
    const offsetWidth = 1670;
    const newHeight = aspectRatio * offsetWidth;

    const top = newHeight / 2 < height ? 0 : Math.round(newHeight / 2);

    // Resize the image to fit the desired width
    image = image.resize(offsetWidth, Math.round(Math.max(newHeight, height)));

    log([LogStyle.purple], "VERBOSE", `canvas height: ${height}, canvas width: ${width}, offset width: ${offsetWidth}, offsetted height: ${newHeight}, aspect ratio: ${aspectRatio.toFixed(2)}, top padding: ${Math.round(newHeight / 2)}`);

    image = image.extract({ height, width: offsetWidth, top, left: 0 });

    // Prepare the image buffer after applying the transformations
    const imageBuffer = await image.toBuffer();

    // Composite the image onto the canvas (background)
    const compositeImage = canvas.composite([{ input: imageBuffer, gravity: "west" }]).webp();

    // Return the final image
    return compositeImage.toBuffer()
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
    
    for await (const city of cities) {
	const fileName = backgroundFiles.find(fileName => fileName.startsWith(formatFileName(city)));

	if (!fileName) {
            log([LogStyle.red, LogStyle.bold], "ERROR", `Background file for ${city.name} not found`);
	    
            continue;
        }

        const filePath = join(downloadsPathBackgrounds, fileName);

	let editedImage;

	try {
	    editedImage = await prepareBackground(filePath);
	} catch(err) {
	    log([LogStyle.bold, LogStyle.red], "ERROR", `Error while preparing background: ${city.name}: ${err}`);
	}

	if (!editedImage) continue;

        log([LogStyle.purple], `EDIT${(Math.floor((++processed / cities.length) * 100).toString() + "%").padStart(11, " ")}`, `Processed image '${filePath}'`);
        
	await writeFile(join(downloadsPathBackgrounds, formatFileName(city, ".edited.webp")), Buffer.from(editedImage));
    }

    log([LogStyle.green], "EDIT", `Processed ${cities.length} images`);
};
