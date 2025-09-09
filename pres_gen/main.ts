import { readdir } from "node:fs/promises";
import { join } from "node:path";
import pptxgen from "pptxgenjs";

const presentation = new pptxgen();
const dataDir = join(import.meta.dirname, "..", "data");
const slidesDir = join(dataDir, "slides");
const presentationPath = join(dataDir, "presentation.pptx");

const slides = await readdir(slidesDir);

const sortedSlides = slides
    .map((file) => {
        const match = file.match(/^(.+?)(?:_(\d+))?\.[^.]+$/);
        return {
            region: match?.[1] || file,
            index: match?.[2] ? parseInt(match[2], 10) : -1,
            filename: file,
        };
    })
    .filter(x => x !== "title.webp")
    .sort((a, b) =>
        a.region === b.region
            ? a.index - b.index
            : a.region.localeCompare(b.region, "pl")
    );


// add title slide

const titleSlide = presentation.addSlide();
titleSlide.addImage({
    path: join(slidesDir, "title.webp"),
    w: "100%",
    h: "100%",
});

// add the rest

sortedSlides.forEach(({ filename }) => {
    presentation.addSlide().addImage({
        path: join(slidesDir, filename),
        w: "100%",
        h: "100%",
    });
});

// write & output

await presentation.writeFile({
    fileName: presentationPath,
});

console.log(`Written to '${presentationPath}'`);
