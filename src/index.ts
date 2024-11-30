import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pptxgen from "pptxgenjs";
import wiki from "wikipedia";

interface City {
    identifier: string;
    cityName: string;
    powiat: string;
    areaHa: number;
    areaKm: number;
    totalPopulation: number;
    populationPerKm: number;
}

const voivodeships: { [name: string]: City[] } = {};

// fetches herbs from wikimedia
async function fetchHerb(cityName: string) {
    wiki.setLang("pl");

    const res = await wiki.page(cityName);

    const { herb } = await res.infobox();

    const media = await res.media();

    const imageData = media.items.filter(x => x.title === `Plik:${herb.replaceAll(" ", "_")}`)[0];

    return `https:${imageData.srcset[0].src}`;
}

// magic thing dont touch it, works.
function formatName(input: string): string {
    return input
        .split(" ")
        .map((part, index) => {
            if (part.includes(".")) {
                const dotIndex = part.indexOf(".") + 1;
                if (dotIndex < part.length) {
                    return (
                        part.substring(0, dotIndex) +
                        part[dotIndex].toUpperCase() +
                        part.substring(dotIndex + 1)
                    );
                }
            } else if (index > 0) {
                return part.charAt(0).toUpperCase() + part.slice(1);
            }
            return part;
        })
        .join(" ");
}

async function parse() {
    const file = await readFile(join(import.meta.dir, "..", "data", "dane.csv"));
    const fileContent = file.toString();

    let currentVoivodeship = "";

    // == read all cities from file and sort them by voivodeship
    for (const line of fileContent.split("\n")) {
        const [
            identifier,
            cityName,
            powiat,
            areaHa,
            areaKm,
            totalPopulation,
            populationPerKm,
        ] = line.trim().split(",");

        if (identifier == "" && cityName !== "") {
            // sort voivodeship after it was proccessed
            if (currentVoivodeship !== "")
                voivodeships[currentVoivodeship].sort(
                    (a, b) => b.totalPopulation - a.totalPopulation
                );

            let voivodeshipName = formatName(
                cityName.split("(")[0].trim().toLocaleLowerCase()
            );
            voivodeships[voivodeshipName] = [];
            currentVoivodeship = voivodeshipName;

            continue;
        }

        const cityObject: City = {
            identifier,
            cityName: formatName(cityName),
            powiat: formatName(powiat),
            areaHa: parseInt(areaHa),
            areaKm: parseInt(areaKm),
            totalPopulation: parseInt(totalPopulation),
            populationPerKm: parseInt(populationPerKm),
        };

        voivodeships[currentVoivodeship].push(cityObject);
    }

    // sort last voivodeship after everything was proccessed
    voivodeships[currentVoivodeship].sort(
        (a, b) => b.totalPopulation - a.totalPopulation
    );
}

async function generatePresentation() {
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

    let currentSlide: pptxgen.Slide;
    let i = 0;

    for (const voivodeshipName of Object.keys(voivodeships)) {
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

        voivodeships[voivodeshipName].forEach((city) => {
            if (i % 5 == 0) currentSlide = presentation.addSlide();

            currentSlide.background = { color: "#000000" };

            const y = 1.125 * (i++ % 5);

            // currentSlide.addImage({
            //     data: 
            // })

            currentSlide.addShape(presentation.ShapeType.rect, {
                x: 0,
                y,
                h: 1.125,
                w: "100%",
                fill: { color: "#0f0f0f" }
            });

            currentSlide.addText(city.cityName, {
                valign: "middle",
                x: 0,
                y,
                h: 1.125,
                w: "40%",
                fontSize: 14,
                color: "#ffffff",
            });
        });
    }

    await presentation.writeFile({
        fileName: join(import.meta.dir, "..", "data", "presentation.pptx"),
    });
}

await parse();
await generatePresentation();

await writeFile(
    join(import.meta.dir, "..", "data", "out.json"),
    JSON.stringify(voivodeships, null, 4),
    { encoding: "utf-8" }
);
