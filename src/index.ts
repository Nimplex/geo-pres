import { readFile } from "node:fs/promises"
import { join } from "node:path";
import pptxgen from "pptxgenjs";
import { parse, readData } from "./parser"; 
import { downloadsPath, formatFileName, scrapeWiki } from "./wiki-scraper";
import type { City, Map, Voivodeship } from "./types";

async function readHerb(city: City) {
    const file = await readFile(join(downloadsPath, `${formatFileName(city)}.png`.replaceAll(" ", "_")));
    const content = file.toString("base64");

    return content;
}

async function generatePresentation(voivodeships: Map<Voivodeship>) {
    const presentation = new pptxgen();
    presentation.layout = "LAYOUT_16x9";

    const titleSlide = presentation.addSlide();
    titleSlide.addText("Wszystkie miasta Polski", {
        align: "center",
        valign: "middle",
        x: 0,
        y: 0,
        h: "100%",
        w: "100%",
        fontSize: 36,
        fontFace: "Work Sans",
        bold: true,
    });

    for (const voivodeshipName of Object.keys(voivodeships)) {
        let i = 0;
        let currentSlide: pptxgen.Slide;

        const voivodeshipTitleSlide = presentation.addSlide();

        voivodeshipTitleSlide.addText(voivodeshipName, {
            align: "center",
            valign: "middle",
            x: 0,
            y: 0,
            h: "100%",
            w: "100%",
            fontSize: 36,
            fontFace: "Work Sans",
            color: "#ffffff",
            bold: true,
        });

        voivodeshipTitleSlide.background = { color: "#000000" };

        for (const city of voivodeships[voivodeshipName]) {
            if (i % 5 == 0) currentSlide = presentation.addSlide();

            currentSlide!.background = { color: "#000000" };

            const y = 1.125 * (i++ % 5);

            currentSlide!.addShape(presentation.ShapeType.rect, {
                x: 0,
                y,
                h: 1.125,
                w: "100%",
                fill: { color: "#0f0f0f" }
            });

            currentSlide!.addText(city.name, {
                valign: "middle",
                x: 0.3,
                y,
                h: 1.125,
                w: "40%",
                fontSize: 14,
                color: "#ffffff",
            });

            currentSlide!.addText(city.totalPopulation.toString(), {
                valign: "middle",
                x: 1.5,
                y,
                h: 1.125,
                w: "40%",
                fontSize: 14,
                color: "#ffffff",
            });

            const herbData = await readHerb(city);

            currentSlide!.addImage({
                data: `data:image/png;base64,${herbData}`,
                h: 0.875,
                w: 0.7,
                y: y + 0.125,
                x: 10 - 0.35 - 0.3 - (0.7 / 2)
            })
        };
    }

    await presentation.writeFile({
        fileName: join(import.meta.dir, "..", "data", "presentation.pptx"),
    });
}

async function main() {
    const data = await readData();
    const voivodeships = parse(data);

    await scrapeWiki(voivodeships);
    await generatePresentation(voivodeships);
}

await main();
