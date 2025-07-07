import { parse, readData } from "./parser"; 
import { scrapeWiki } from "./wiki-scraper";
import { editBackgrounds } from "./image-editor";
import { generatePresentation } from "./pptx-gen";

async function main() {
    const data = await readData();
    const voivodeships = parse(data);

    console.time("worker");

    await scrapeWiki(voivodeships);
    await editBackgrounds(voivodeships);
    await generatePresentation(voivodeships);

    console.timeEnd("worker");
}

await main();
