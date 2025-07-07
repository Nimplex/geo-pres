import pptxgen from "pptxgenjs";
import { join } from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { downloadsPathCOA, downloadsPathBackgrounds, formatFileName } from "./wiki-scraper";
import { log, LogStyle } from "./logger";
import type { City, Map, Voivodeship } from "./types";
import sharp from "sharp";
import TextToSVG, { type GenerationOptions } from "text-to-svg"
import { existsSync } from "node:fs";

function findCoatOfArms(files: string[], city: City) {
    const fileName = files.find(x => x.startsWith(formatFileName(city)));

    if (!fileName)
        return undefined;

    return join(downloadsPathCOA, fileName);
}

function chunk<T>(array: T[], size: number): T[][] {
    const arr = [];
    for (let i = 0; i < array.length; i += size)
        arr.push(array.slice(i, i + size));
    return arr;
}

const slidesPath = join(import.meta.dirname, "..", "data", "slides");

export async function generatePresentation(voivodeships: Map<Voivodeship>) {
    if (!existsSync(slidesPath)) {
        log([LogStyle.yellow], "WARN", `Slides directory "${slidesPath}" doesn't exist, creating one for you`);
        await mkdir(slidesPath).catch(_ => {
            throw new Error(`Error creating directory ${slidesPath}`);
        });
    }

    log([LogStyle.purple], "VERBOSE", "Loading TextToSVG");
    const textToSVG = TextToSVG.loadSync();

    log([LogStyle.purple], "VERBOSE", `Reading "${downloadsPathCOA}" for coats of arms`);

    let coaFiles: string[] = [];

    try {
        coaFiles = await readdir(downloadsPathCOA);
    } catch(err) {
        log([LogStyle.red, LogStyle.bold], "ERROR", `Couldn't read downloads directory for existing files: ${err}`);
    }

    log([LogStyle.blue], "PRESGEN", "Generating slides");
    
    const tasks = [];

    for (const voivodeshipName of Object.keys(voivodeships)) {
        const chunks = chunk(voivodeships[voivodeshipName], 5);

        for (const [i, chunk] of chunks.entries()) {
            async function generateSlide(chunk: City[], i: number, voivodeshipName: string) {
                const slide = sharp({
                    create: {
                        width: 1920,
                        height: 1080,
                        channels: 4,
                        background: "#FEFEFE"
                    }
                });

                const slideComposites: sharp.OverlayOptions[] = [];

                for (const [i, city] of chunk.entries()) {
                    const entryHeight = 216;
                    const yOffset = i * entryHeight;

                    const entry = sharp({
                        create: {
                            width: 1920,
                            height: entryHeight,
                            channels: 4,
                            background: "#000000"
                        }
                    });
                    const entryComposites: sharp.OverlayOptions[] = [];

                    // add background
                    // -------------------------------------------------------------
                    await readFile(
                        join(downloadsPathBackgrounds, formatFileName(city, ".edited.webp"))
                    ).then(buff => {
                        entryComposites.push({
                            input: buff,
                            top: 0,
                            left: 0
                        });
                    }).catch((err) => {
                        log(
                            [LogStyle.red, LogStyle.bold],
                            "PPTX ERR",
                            `Couldn't read background image for: ${city.name}, ${err}`
                        );
                    });

                    const options: GenerationOptions = {
                        fontSize: 32,
                        anchor: "top",
                        attributes: { fill: "white" },
                    };

                    // city name
                    // -------------------------------------------------------------
                    const cityNameMetrics = textToSVG.getMetrics(city.name, {
                        fontSize: 48,
                        anchor: "top",
                    });
                    const cityNameD = textToSVG.getD(city.name, {
                        fontSize: 48,
                        anchor: "top",
                        attributes: {
                            fill: "white"
                        }
                    });
                    entryComposites.push({
                        input: Buffer.from(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="${cityNameMetrics.width}" height="${cityNameMetrics.height}" viewBox="0 0 ${cityNameMetrics.width} ${cityNameMetrics.height}">
                            <path d="${cityNameD}" fill="white" />
                        </svg>
                        `.trim()),
                        top: Math.round((216 - cityNameMetrics.height) / 2),
                        left: 100
                    });

                    // powiat
                    // -------------------------------------------------------------
                    const cityPowiatMetrics = textToSVG.getMetrics(city.powiat, options);
                    const cityPowiatD = textToSVG.getD(city.powiat, options);
                    entryComposites.push({
                        input: Buffer.from(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="${cityPowiatMetrics.width}" height="${cityPowiatMetrics.height}" viewBox="0 0 ${cityPowiatMetrics.width} ${cityPowiatMetrics.height}">
                            <path d="${cityPowiatD}" fill="white" />
                        </svg>
                        `.trim()),
                        top: Math.round((216 - cityPowiatMetrics.height) / 2),
                        left: 100 + cityNameMetrics.width + 32
                    });

                    // population
                    // -------------------------------------------------------------
                    const populationMetrics = textToSVG.getMetrics(`${city.totalPopulation} (całkowita)`, options);
                    const populationD = textToSVG.getD(`${city.totalPopulation} (całkowita)`, options);
                    entryComposites.push({
                        input: Buffer.from(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="${populationMetrics.width}" height="${populationMetrics.height}" viewBox="0 0 ${populationMetrics.width} ${populationMetrics.height}">
                            <path d="${populationD}" fill="white" />
                        </svg>
                        `.trim()),
                        top: Math.round((216 - populationMetrics.height) / 2),
                        left: 100 + cityNameMetrics.width + cityPowiatMetrics.width + (32 * 2)
                    });

                    // population/km2
                    // -------------------------------------------------------------
                    const perKmSquaredMetrics = textToSVG.getMetrics(`${city.populationPerKm} (osób/km^2)`, options);
                    const perKmSquaredD = textToSVG.getD(`${city.populationPerKm} (osób/km^2)`, options);
                    entryComposites.push({
                        input: Buffer.from(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="${perKmSquaredMetrics.width}" height="${perKmSquaredMetrics.height}" viewBox="0 0 ${perKmSquaredMetrics.width} ${perKmSquaredMetrics.height}">
                            <path d="${perKmSquaredD}" fill="white" />
                        </svg>
                        `.trim()),
                        top: Math.round((216 - perKmSquaredMetrics.height) / 2),
                        left: 100 + cityNameMetrics.width + cityPowiatMetrics.width + populationMetrics.width + (32 * 3)
                    });

                    // area in km2
                    // -------------------------------------------------------------
                    const landMetrics = textToSVG.getMetrics(`${city.areaKm} km^2`, options);
                    const landD = textToSVG.getD(`${city.areaKm} km^2`, options);
                    entryComposites.push({
                        input: Buffer.from(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="${landMetrics.width}" height="${landMetrics.height}" viewBox="0 0 ${landMetrics.width} ${landMetrics.height}">
                            <path d="${landD}" fill="white" />
                        </svg>
                        `.trim()),
                        top: Math.round((216 - landMetrics.height) / 2),
                        left: 100 + cityNameMetrics.width + cityPowiatMetrics.width + populationMetrics.width + perKmSquaredMetrics.width + (32 * 4)
                    });

                    // COA
                    // -------------------------------------------------------------
                    const coaFileName = findCoatOfArms(coaFiles, city);
                    if (!coaFileName) {
                        log([LogStyle.yellow, LogStyle.bold], "WARN", `Skipping ${city.name} -- no COA`);
                        continue;
                    };

                    const coaBuffer = await readFile(coaFileName).catch(() => {
                        log(
                            [LogStyle.bold, LogStyle.red],
                            "FILE NOT FOUND",
                            `No COA found for '${city.name}'. This may happen due to errors in scraping. Exiting...`
                        );
                        log([LogStyle.bold, LogStyle.purple], "VERBOSE", `${join(downloadsPathCOA, formatFileName(city, ".png"))}`)
                        process.exit(1);
                    });

                    const resizedCOA = await sharp(coaBuffer).resize({ height: 184 }).png().toBuffer();
                    const coaMeta = await sharp(resizedCOA).metadata();

                    entryComposites.push({
                        input: resizedCOA,
                        top: 16,
                        left: Math.round(1920 - 125 - ((coaMeta.width ?? 0) / 2))
                    });

                    const entryBuffer = await entry.composite(entryComposites).png().toBuffer();
                    slideComposites.push({
                        input: entryBuffer,
                        top: yOffset,
                        left: 0
                    });
                }

                const slideBuffer = await slide.composite(slideComposites).png().toBuffer();
                await writeFile(join(slidesPath, `${voivodeshipName}.${i}.png`), slideBuffer);
            }

            tasks.push(generateSlide(chunk, i, voivodeshipName));
        }
    }

    await Promise.all(tasks);

    // const presentation = new pptxgen();
    // presentation.layout = "LAYOUT_16x9";

    // const titleSlide = presentation.addSlide();
    // titleSlide.addText("Wszystkie miasta Polski", {
    //     align: "center",
    //     valign: "middle",
    //     x: 0,
    //     y: 0,
    //     h: "100%",
    //     w: "100%",
    //     fontSize: 36,
    //     fontFace: "Work Sans",
    //     bold: true,
    // });

    // const citiesPerPage = 5;
    // const bottomMargin = 0.05; // gap between pages

    // const leftPadding = 0.3; // space from left
    // const blockHeight = 5.625 / citiesPerPage - (bottomMargin * ((citiesPerPage - 1) / citiesPerPage)); // 5.625 inches height of presentation - 1.125 when 5 per page

    // const herbHeight = blockHeight - 0.25;
    // const herbWidth = herbHeight / 1.6;

    // for (const voivodeshipName of Object.keys(voivodeships)) {
    //     let currentSlide: pptxgen.Slide;

    //     const voivodeshipTitleSlide = presentation.addSlide();
    //     voivodeshipTitleSlide.background = { color: "#000000" };
    //     voivodeshipTitleSlide.addText(voivodeshipName, {
    //         align: "center",
    //         valign: "middle",
    //         x: 0,
    //         y: 0,
    //         h: "100%",
    //         w: "100%",
    //         fontSize: 36,
    //         fontFace: "Work Sans",
    //         color: "#ffffff",
    //         bold: true,
    //     });

    //     for (const [i, city] of voivodeships[voivodeshipName].entries()) {
    //         if (i % 5 == 0) currentSlide = presentation.addSlide();

    //         currentSlide!.background = { color: "#2e2e2e" };

    //         const yPos = (blockHeight + bottomMargin) * (i % citiesPerPage);
    //         const backgroundImage = await readFileAsB64(
    //             join(downloadsPathBackgrounds, formatFileName(city, ".edited.webp"))
    //         ).catch((err) => {
    //             log(
    //                 [LogStyle.red, LogStyle.bold],
    //                 "PPTX ERR",
    //                 `Couldn't read background image for: ${city.name}, ${err}`
    //             );
    //         });

    //         if (backgroundImage)
    //             currentSlide!.addImage({
    //                 data: `data:image/png;base64,${backgroundImage}`,
    //                 x: 0,
    //                 y: yPos,
    //                 h: blockHeight,
    //                 w: "100%",
    //             });

    //         currentSlide!.addText(city.name, {
    //             valign: "middle",
    //             x: leftPadding,
    //             y: yPos,
    //             h: blockHeight,
    //             fontSize: 14,
    //             color: "#ffffff",
    //         });

    //         currentSlide!.addText(city.totalPopulation.toString(), {
    //             valign: "middle",
    //             x: leftPadding + 1.5,
    //             y: yPos,
    //             h: blockHeight,
    //             fontSize: 14,
    //             color: "#ffffff",
    //         });

    //         const coaFileName = findCoatOfArms(coaFiles, city);
    //         if (!coaFileName) continue;

    //         const herbData = await readFileAsB64(coaFileName).catch(() => {
    //             log(
    //                 [LogStyle.bold, LogStyle.red],
    //                 "FILE NOT FOUND",
    //                 `No COA found for '${city.name}'. This may happen due to errors in scraping. Exiting...`
    //             );
    //             log([LogStyle.bold, LogStyle.purple], "VERBOSE", `${join(downloadsPathCOA, formatFileName(city, ".png"))}`)
    //             process.exit(1);
    //         });

    //         currentSlide!.addImage({
    //             data: `data:image/png;base64,${herbData}`,
    //             x: 10 - leftPadding - herbWidth,
    //             y: yPos + (blockHeight - herbHeight) / 2,
    //             h: herbHeight,
    //             w: herbWidth,
    //         });
    //     }
    // }

    // const fileName = join(import.meta.dir, "..", "data", "presentation.pptx")
    
    // await presentation.writeFile({
    //     fileName,
    // });

    // log([LogStyle.cyan, LogStyle.italic], "PPTX", `Finished generating. Output file: ${fileName}`);
}
