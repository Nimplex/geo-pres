import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pptxgen from "pptxgenjs";
import { downloadsPathCOA, downloadsPathBackgrounds, formatFileName } from "./wiki-scraper";
import { log, LogStyle } from "./logger";
import type { City, Map, Voivodeship } from "./types";

async function readFileAsB64(path: string) {
    const file = await readFile(path);
    const content = file.toString("base64");

    return content;
}

function findCoatOfArms(files: string[], city: City) {
    const fileName = files.find(x => x.startsWith(formatFileName(city)));

    if (!fileName)
        return undefined;

    return join(downloadsPathCOA, fileName);
}

export async function generatePresentation(voivodeships: Map<Voivodeship>) {
    log([LogStyle.blue], "PRESGEN", "Generating pptx");
    log([LogStyle.purple], "VERBOSE", `Reading "${downloadsPathCOA}" for coats of arms`);

    let coaFiles: string[] = [];

    try {
        coaFiles = await readdir(downloadsPathCOA);
    } catch(err) {
        log([LogStyle.red, LogStyle.bold], "ERROR", `Couldn't read downloads directory for existing files: ${err}`);
    }

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

    const citiesPerPage = 5;
    const bottomMargin = 0.05; // gap between pages

    const leftPadding = 0.3; // space from left
    const blockHeight = 5.625 / citiesPerPage - (bottomMargin * ((citiesPerPage - 1) / citiesPerPage)); // 5.625 inches height of presentation - 1.125 when 5 per page

    const herbHeight = blockHeight - 0.25;
    const herbWidth = herbHeight / 1.6;

    for (const voivodeshipName of Object.keys(voivodeships)) {
        let currentSlide: pptxgen.Slide;

        const voivodeshipTitleSlide = presentation.addSlide();
        voivodeshipTitleSlide.background = { color: "#000000" };
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

        for (const [i, city] of voivodeships[voivodeshipName].entries()) {
            if (i % 5 == 0) currentSlide = presentation.addSlide();

            currentSlide!.background = { color: "#2e2e2e" };

            const yPos = (blockHeight + bottomMargin) * (i % citiesPerPage);
            const backgroundImage = await readFileAsB64(
                join(downloadsPathBackgrounds, formatFileName(city, ".edited.webp"))
            ).catch((err) => {
                log(
                    [LogStyle.red, LogStyle.bold],
                    "PPTX ERR",
                    `Couldn't read background image for: ${city.name}, ${err}`
                );
            });

            if (backgroundImage)
                currentSlide!.addImage({
                    data: `data:image/png;base64,${backgroundImage}`,
                    x: 0,
                    y: yPos,
                    h: blockHeight,
                    w: "100%",
                });

            currentSlide!.addText(city.name, {
                valign: "middle",
                x: leftPadding,
                y: yPos,
                h: blockHeight,
                fontSize: 14,
                color: "#ffffff",
            });

            currentSlide!.addText(city.totalPopulation.toString(), {
                valign: "middle",
                x: leftPadding + 1.5,
                y: yPos,
                h: blockHeight,
                fontSize: 14,
                color: "#ffffff",
            });

            const coaFileName = findCoatOfArms(coaFiles, city);
            if (!coaFileName) continue;

            const herbData = await readFileAsB64(coaFileName).catch(() => {
                log(
                    [LogStyle.bold, LogStyle.red],
                    "FILE NOT FOUND",
                    `No COA found for '${city.name}'. This may happen due to errors in scraping. Exiting...`
                );
                log([LogStyle.bold, LogStyle.purple], "VERBOSE", `${join(downloadsPathCOA, formatFileName(city, ".png"))}`)
                process.exit(1);
            });

            currentSlide!.addImage({
                data: `data:image/png;base64,${herbData}`,
                x: 10 - leftPadding - herbWidth,
                y: yPos + (blockHeight - herbHeight) / 2,
                h: herbHeight,
                w: herbWidth,
            });
        }
    }

    const fileName = join(import.meta.dir, "..", "data", "presentation.pptx")
    
    await presentation.writeFile({
        fileName,
    });

    log([LogStyle.cyan, LogStyle.italic], "PPTX", `Finished generating. Output file: ${fileName}`);
}
