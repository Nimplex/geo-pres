import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dataDirPath } from "./parser";
import { log, LogStyle } from "./logger";
import type { City, Map, Voivodeship } from "./types";

export const downloadsPathCOA = join(dataDirPath, "coats-of-arms");
export const downloadsPathBackgrounds = join(dataDirPath, "backgrounds");

export function formatFileName(city: City, suffix = "") {
    return `${city.identifier}+${city.name}${suffix}`.replaceAll(" ", "_");
}

async function downloadFile(URL: string, filename: string, location: string) {
    const res = await fetch(URL);

    if (res.status !== 200)
        throw new Error(`${res.status}: Couldn't download file \x1b[1m${URL.replaceAll("//upload.wikimedia.org/wikipedia/commons/thumb", "(...)")}\x1b[m`);

    const buffer = await res.arrayBuffer();

    return await writeFile(join(location, `${filename}.png`), Buffer.from(buffer));
}

async function tryPage(cityName: string, suffix: string, regexes: RegExp[], names: string[], index: number, total: number) {
    const cityLink = `${cityName}${suffix}`.replaceAll(" ", "_");
    const response = await fetch(`https://pl.wikipedia.org/wiki/${cityLink}`);

    if (response.status === 404)
        throw new Error(`404: \x1b[1m${cityLink.padStart(48, " ")}\x1b[m, trying next...`);

    const text = (await response.text());

    const links = regexes.map(regex => {
        let result = regex.exec(text);

        if (!result)
            throw new Error(`No match: \x1b[1m${cityLink.padStart(43, " ")}\x1b[m, trying next...`);

        return `https:${result[1]}`;
    })

    links.forEach((link, i) => {
        const newLink = link.replaceAll(/^.*\//g, " ");

        log(
            [LogStyle.bold, LogStyle.green],
            i ? `+ ${`${index}/${total}`.padStart(13, " ")}` : `HIT`,
            `${i ? " ".repeat(54) : cityLink.padStart(53, " ") + ":"} ${names[i].padEnd(6, " ")} --> ${newLink}`
        );
    })
    
    return links
}

export async function scrapeWiki(voivodeships: Map<Voivodeship>) {
    try {
        if (!existsSync(downloadsPathCOA)) {
            log([LogStyle.yellow], "WARN", `Downloads directory "${downloadsPathCOA}" doesn't exist, creating one for you`);
            await mkdir(downloadsPathCOA);
        }
        if (!existsSync(downloadsPathBackgrounds)) {
            log([LogStyle.yellow], "WARN", `Downloads directory "${downloadsPathBackgrounds}" doesn't exist, creating one for you`);
            await mkdir(downloadsPathBackgrounds);
        }
    } catch (err) {
        log([LogStyle.red, LogStyle.bold], "ERROR", "Couldn't create downloads directory, exiting");
        return process.exit(1);
    }

    let cities = Object.keys(voivodeships).map(voivode => voivodeships[voivode].map(city => Object.assign(city, { voivodeship: voivode }))).flat();
    const totalEntries = cities.length;

    try {
        const coaFiles = readdirSync(downloadsPathCOA);
        let backgroundFiles = readdirSync(downloadsPathBackgrounds);
        backgroundFiles = backgroundFiles.filter(fileName => coaFiles.includes(fileName));
        cities = cities.filter(city => !backgroundFiles.includes(formatFileName(city) + ".png"));
    } catch (err) {
        log([LogStyle.red, LogStyle.bold], "ERROR", `Couldn't read downloads directory for existing files: ${err}`);
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

    const regexesNames = ["COA", "Image"];
    const regexesList = [
        [/<img .*?alt="Herb" .*?src="(.+?)".*?>/, /<tr class="grafika iboxs.*?<img .*?src="(.+?)".*?>/s], // main match
        [/<img .*?src="(.+?COA.+?)".*?>/, /<img .*?alt="Ilustracja" .*?src="(.+?)".*?>/i],                // workaround for 'Solec nad Wisłą' and 'Baranów Sandomierski'
    ];
    
    for (const [index, city] of cities.entries()) {
        let found = false;
        let hitnum = 1;

        if (city.repeating)
            log([LogStyle.yellow, LogStyle.bold], "REPEATING", `Downloading city '${city.name}' in reverse suffix order, because it repeats in the data set`);

        for (const regs of regexesList) {
            for (const suffix of city.repeating
                ? [`_(powiat ${city.powiat})`, `_(województwo_${city.voivodeship})`, "_(miasto)", ""]
                : ["", "_(miasto)", `_(województwo_${city.voivodeship})`, `_(powiat_${city.powiat})`]
            ) {
                const result = await tryPage(
                    city.name,
                    suffix,
                    regs,
                    regexesNames,
                    index + 1,
                    cities.length
                ).catch(err => {
                    log([LogStyle.yellow], `NO HIT (#${hitnum++})`, err.message);
                });

                if (!result)
                    continue;

                found = true;
                hitnum = 1;

                const [coa, background] = result;

                const errorHandle = (err: Error) => {
                    const errnum = err.message.substring(0, 2);
                    log([LogStyle.red, LogStyle.bold], `ERROR ${errnum}`, err.message.substring(5));
                }
                
                downloads.push(downloadFile(coa, formatFileName(city), downloadsPathCOA).catch(errorHandle));
                downloads.push(downloadFile(background, formatFileName(city), downloadsPathBackgrounds).catch(errorHandle));

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

    log([LogStyle.cyan, LogStyle.italic], "FINISHED", `Finished scraping; \x1b[1;32m${cities.length - errors} found\x1b[m, \x1b[1;31m${errors} errors\x1b[m`);

    if (errors) {
        log([LogStyle.italic, LogStyle.red], "EXITING", "Exiting due to previous errors in scraping...");
        process.exit(1);
    }
}
