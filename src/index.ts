import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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

// magic thing dont touch it, works.
function formatName(input: string): string {
    return input
        .split(" ")
        .map((part, index) => {
            if (part.includes(".")) {
                const dotIndex = part.indexOf(".") + 1;
                if (dotIndex < part.length) {
                    return part.substring(0, dotIndex) + part[dotIndex].toUpperCase() + part.substring(dotIndex + 1);
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
            if (currentVoivodeship !== "")
                voivodeships[currentVoivodeship].sort((a, b) => b.totalPopulation - a.totalPopulation);

            let voivodeshipName = formatName(cityName.split("(")[0].trim().toLocaleLowerCase());
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
}

await parse();

await writeFile(
    join(import.meta.dir, "..", "data", "out.json"),
    JSON.stringify(voivodeships, null, 4),
    { encoding: "utf-8" }
);
