import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { City } from "./types";

export const dataDirPath = join(import.meta.dir, "..", "data");

export function parse(data: string) {
    const voivodeships: { [name: string]: City[] } = {};

    let currentVoivodeship = "";

    for (const line of data.split("\n")) {
        const [identifier, name, powiat, areaHa, areaKm, totalPopulation, populationPerKm] = line.trim().split(",");

        // our csv is formatted in such way that if the identifier is empty and
        // name isn't then it's next voivodeship
        if (identifier == "" && name !== "") {
            // sort processed voivodeship's cities by population
            if (currentVoivodeship !== "")
                voivodeships[currentVoivodeship].sort((a, b) => b.totalPopulation - a.totalPopulation);

            // parse name and set it
            // let voivodeshipName = formatName(name.split("(")[0].trim().toLocaleLowerCase());
            let voivodeshipName = /woj\. (.+?)  /.exec(name.toLocaleLowerCase())[1];
            
            voivodeships[voivodeshipName] = [];
            currentVoivodeship = voivodeshipName;

            continue;
        }

        const cityObject: City = {
            identifier,
            name,
            powiat: powiat.toLocaleLowerCase(),
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
