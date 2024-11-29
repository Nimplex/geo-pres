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
    rankingInAreaInHa: number;
    rankingInPopulation: number;
}

const voivodeships: { [name: string]: City[] } = {};

async function parse() {
    const file = await readFile(join(import.meta.dir, "..", "data", "dane.csv"));
    const fileContent = file.toString();

    let i = 0;
    let currentVoivodeship = "";

    for (const line of fileContent.split("\n")) {
        const [
            identifier,
            cityName,
            powiat,
            areaHa,
            areaKm,
            totalPopulation,
            populationPerKm,
            rankingInAreaInHa,
            rankingInPopulation,
        ] = line.trim().split(",");

        if (identifier == "" && cityName !== "") {
            const voivodeshipName = cityName.split("(")[0].trim();
            voivodeships[voivodeshipName] = [];
            currentVoivodeship = voivodeshipName;
            continue;
        }

        const cityObject: City = {
            identifier,
            cityName,
            powiat,
            areaHa: parseInt(areaHa),
            areaKm: parseInt(areaKm),
            totalPopulation: parseInt(totalPopulation),
            populationPerKm: parseInt(populationPerKm),
            rankingInAreaInHa: parseInt(rankingInAreaInHa),
            rankingInPopulation: parseInt(rankingInPopulation),
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
