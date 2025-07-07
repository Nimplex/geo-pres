import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { exit } from "node:process";

import { log, LogStyle } from "./logger";
import { scrapeWiki } from "./wiki-scraper";
import { ensureExists } from "./utils";
import { parse } from "./parser";

// import { editBackgrounds } from "./image-editor";
// import { generatePresentation } from "./pptx-gen";

const dataPath = join(import.meta.dir, "..", "data")
export const paths = {
    data: dataPath,
    COA: join(dataPath, "coats-of-arms"),
    backgrounds: join(dataPath, "backgrounds"),
    editedBackgrounds: join(dataPath, "edited-backgrounds"),
    slides: join(dataPath, "slides")
}

async function main() {
    log([LogStyle.blue], "MAIN", "Starting GeoPres");

    await ensureExists(dataPath);

    log([LogStyle.purple], "VERBOSE", "Reading \"dane.csv\"");

    let data;
    try {
        data = await readFile(join(dataPath, "dane.csv"), "utf-8");
        data = data.replaceAll(/[\r]/g, "");
    } catch (err) {
        log([LogStyle.red, LogStyle.bold], "ERROR", "Failed to read \"dane.csv\"", err);
        exit(1);
    }

    const voivodeships = parse(data.toString());

    await scrapeWiki(voivodeships);
    // await editBackgrounds(voivodeships);
    // await generatePresentation(voivodeships);
}

await main();
