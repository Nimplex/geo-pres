import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pptxgen from "pptxgenjs";

const presentation = new pptxgen();
const dataDir = join(import.meta.dirname, "..", "data");
const slidesDir = join(dataDir, "slides");
const presentationPath = join(dataDir, "presentation.pptx");

const slides = await readdir(slidesDir);

const sortedSlides = slides
    .map((file) => {
        const match = file.match(/^(\d+)[_](.+?)(?:_(\d+))?\.[^.]+$/);
        return {
            index: parseInt(match?.[1] || "0"),
            region: match?.[2] || file,
            slide_index: match?.[3] ? parseInt(match[3], 10) : -1,
            filename: file,
        };
    })
    .filter(x => x.filename !== "title.webp")
    .sort((a, b) => {
        if (a.index !== b.index) return a.index - b.index;
        return a.slide_index - b.slide_index;
    });

console.log(sortedSlides)

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
