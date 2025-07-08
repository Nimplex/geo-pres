import { exit } from "node:process";

import { LogStyle, log, timeEnd, timeStart } from "./logger";
import type { City, Voivodeship, Map } from "./types";

export function parse(data: string) {
    timeStart("parser");

    const voivodeships: Map<Voivodeship> = {};
    let currentVoivodeship = "";
    
    log([LogStyle.blue, LogStyle.bold], "PARSER", "Parsing CSV data");

    const lines = data.split("\n");

    for (const [i, line] of lines.entries()) {
        const [
            identifier,
            name,
            powiat,
            areaHa,
            areaKm,
            totalPopulation,
            populationPerKm
        ] = line.trim().split(",");

        if (!identifier && name) {
            if (currentVoivodeship !== "") {
                voivodeships[currentVoivodeship]
                    .sort((a, b) => b.totalPopulation - a.totalPopulation);
            }

            const match = /woj\. (.+?)\s{2,}/.exec(name.toLocaleLowerCase());

            if (!match || !match[1]) {
                log(
                    [LogStyle.red],
                    "ERROR",
                    `Failed to parse voivodeship name\n${i + 1} |  "${line}"`
                );
                exit(1);
            }

            const voivodeshipName = match[1];
            log(
                [LogStyle.cyan],
                `PARSER ${Math.round(i / lines.length * 100)}%`,
                `Detected new voivodeship: "${voivodeshipName}"`
            );
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

    voivodeships[currentVoivodeship]
        .sort((a, b) => b.totalPopulation - a.totalPopulation);

    log([LogStyle.blue, LogStyle.bold], "PARSER", "Parsed CSV data");
    timeEnd("parser");

    return voivodeships;
}