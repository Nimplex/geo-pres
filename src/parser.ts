import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { City } from "./types";

export const dataDirPath = join(import.meta.dir, "..", "data");

export function formatName(input: string): string {
    const lowerInput = input.toLowerCase();

    const dotIndex = input.indexOf(".");

    const beforePart = lowerInput.substring(0, dotIndex + 1).trim();
    const afterPart = lowerInput.substring(dotIndex + 1).trim();

    return [
        beforePart,
        afterPart
            .split("-")
            .map((x) => x.charAt(0).toUpperCase() + x.substring(1))
            .join("-")
            .split(" ")
            .map((x) => x.charAt(0).toUpperCase() + x.substring(1))
            .join(" "),
    ]
        .join(" ")
        .trim();
}

export function parse(data: string) {
    const voivodeships: { [name: string]: City[] } = {};

    let currentVoivodeship = "";

    for (const line of data.split("\n")) {
        const [identifier, cityName, powiat, areaHa, areaKm, totalPopulation, populationPerKm] = line.trim().split(",");

        // our csv is formatted in such way that if the identifier is empty and
        // cityName isn't then it's next voivodeship
        if (identifier == "" && cityName !== "") {
            // sort processed voivodeship's cities by population
            if (currentVoivodeship !== "")
                voivodeships[currentVoivodeship].sort((a, b) => b.totalPopulation - a.totalPopulation);

            // parse name and set it
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

    // sort last voivodeship after everything was proccessed
    voivodeships[currentVoivodeship].sort((a, b) => b.totalPopulation - a.totalPopulation);

    return voivodeships;
}

export async function readData() {
    const filePath = join(dataDirPath, "dane.csv");
    const fileBuffer = await readFile(filePath);
    const fileContent = fileBuffer.toString();

    return fileContent;
}
