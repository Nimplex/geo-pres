import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dataDirPath } from "./parser";
import { LogStyle, log } from "./logger";
import type { City, Map, Voivodeship } from "./types";

export const downloadsPath = join(dataDirPath, "coats-of-arms");

export function formatFileName(city: City, sufix = "") {
    return `${city.identifier}+${city.name}${sufix}`.replaceAll(" ", "_");
}

async function downloadFile(URL: string, filename: string) {
    const res = await fetch(URL);

    if (res.status !== 200)
        log([LogStyle.red, LogStyle.bold], `ERROR ${res.status}`, `Couldn't download COA for ${filename}.png`);

    const buffer = await res.arrayBuffer();

    return await writeFile(join(downloadsPath, `${filename}.png`), Buffer.from(buffer));
}

async function tryPage(cityName: string, suffix: string, regex: RegExp, index: number, total: number) {
    const cityLink = cityName.replaceAll(" ", "_") + suffix;
    let response = await fetch(`https://pl.wikipedia.org/wiki/${cityLink}`);

    if (response.status === 404) {
        throw new Error(`404: \x1b[1m${cityLink.padStart(48, " ")}\x1b[m, trying next...`);
    }

    let result = regex.exec(await response.text());
    if (!result) {
        throw new Error(`No COA: \x1b[1m${cityLink.padStart(45, " ")}\x1b[m, trying next...`);
    }

    log([LogStyle.bold, LogStyle.green], `HIT ${`${index}/${total}`.padStart(11, " ")}`, `${cityLink}`.padStart(53, " "), `, ${result[1].replaceAll("//upload.wikimedia.org/wikipedia/commons/thumb", "(...)")}`)

    return `https:${result[1]}`;
}

export async function scrapeWiki(voivodeships: Map<Voivodeship>) {
    try {
        if (!existsSync(downloadsPath)) {
            log([LogStyle.yellow], "WARN", `Downloads directory "${downloadsPath}" doesn't exist, creating one for you`);
            await mkdir(downloadsPath);
        }
    } catch (err) {
        log([LogStyle.red, LogStyle.bold], "ERROR", "Couldn't create downloads directory, exiting");
        return process.exit(1);
    }

    let cities = Object.keys(voivodeships).map(voivode => voivodeships[voivode].map(city => Object.assign(city, { voivodeship: voivode }))).flat();
    const totalEntries = cities.length;

    try {
        const files = readdirSync(downloadsPath);
        cities = cities.filter(city => !files.includes(`${city.identifier}+${city.name}.png`.replaceAll(" ", "_")));
    } catch (err) {
        log([LogStyle.red, LogStyle.bold], "ERROR", "Couldn't read downloads directory for existing files");
    }

    if (totalEntries != cities.length)
        log([LogStyle.blue], "EXISTING", `Found existing files, left to scrape ${cities.length} out of ${totalEntries}`);

    let downloads = [];
    let errors = 0;

    let foundCities: Map<number> = {};
    cities.forEach(city => {
        foundCities[city.name] ? foundCities[city.name]++ : foundCities[city.name] = 1;
    });

    cities.filter(city => foundCities[city.name] > 1).forEach(city => {
        city.repeating = true;
    });

    for (const [index, city] of cities.entries()) {
        let found = false;
        let hitnum = 1;

        if (city.repeating)
            log([LogStyle.yellow, LogStyle.bold], "REPEATING", `Downloading city '${city.name}' in reverse suffix order, because it repeats in the data set`);

        for (const regex of [new RegExp(/<img .*?alt="Herb" .*?src="(.+?)".*?>/g), new RegExp(/<img.*?src="(.+?COA.+?)".*?>/g)]) {
            for (const suffix of city.repeating
                ? [`_(powiat ${city.powiat})`, `_(województwo_${city.voivodeship})`, "_(miasto)", ""]
                : ["", "_(miasto)", `_(województwo_${city.voivodeship})`, `_(powiat_${city.powiat})`]
            ) {
                const result = await tryPage(city.name, suffix, regex, index + 1, cities.length).catch(err => {
                    log([LogStyle.yellow], `NO HIT (#${hitnum++})`, err.message);
                });

                if (!result)
                    continue;

                found = true;
                hitnum = 1;

                downloads.push(downloadFile(result, formatFileName(city)));

                break;
            }

            if (found)
                break;
        }

        if (found)
            continue;

        log([LogStyle.bold, LogStyle.red], "ERROR", `No result found for ${city.name}`);

        errors++;
    }

    await Promise.all(downloads); // just in case
    log([LogStyle.cyan, LogStyle.italic], "FINISHED", `Finished scraping; \x1b[1;32m${cities.length - errors} found\x1b[m, \x1b[1;31m${errors} errors\x1b[m`)
}
