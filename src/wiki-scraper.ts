import { join, parse as parsePath } from "node:path";
import { writeFile, readdir } from "node:fs/promises";

import { paths } from ".";
import { ensureExists } from "./utils";
import { log, LogStyle, timeStart, timeEnd } from "./logger";
import type { City, Map, Voivodeship } from "./types";

export function formatFileName(city: City) {
    return `${city.identifier}+${city.name}`.replaceAll(" ", "_");
}

async function downloadFile(URL: string, filename: string, location: string) {
    const res = await fetch(URL);

    if (res.status !== 200)
        throw new Error(`${res.status}: Couldn't download file \x1b[1m${URL.replaceAll("//upload.wikimedia.org/wikipedia/commons", "(...)")}\x1b[m`);

    const buffer = await res.arrayBuffer();
    const fileFormat = (/[.]\w+?$/.exec(URL) || [])[0] || ".png";

    await writeFile(join(location, `${filename}${fileFormat}`), Buffer.from(buffer));
}

async function tryPage(
    cityName: string,
    suffix: string,
    regexes: RegExp[],
    names: string[],
    stripThumb: boolean[],
    index: number,
    total: number
) {
    const cityLink = `${cityName}${suffix}`.replaceAll(" ", "_");
    const response = await fetch(`https://pl.wikipedia.org/wiki/${cityLink}`);

    if (response.status === 404)
        throw new Error(`404: \x1b[1m${cityLink.padStart(48)}\x1b[m, trying next...`);

    const text = await response.text();

    const links = regexes.map((regex) => {
        const result = regex.exec(text);
        if (!result)
            throw new Error(`No match: \x1b[1m${cityLink.padStart(43)}\x1b[m, trying next...`);
        return `https:${result[1]}`;
    });

    if (new Set(links).size !== links.length)
        throw new Error(`Repeated img: \x1b[1m${cityLink.padStart(39)}\x1b[m, trying next...`);

    const cleanLinks = links.map((link, i) =>
        stripThumb[i] && /\/thumb/.test(link)
            ? link.replaceAll("/thumb", "").replace(/\/[^\/]*?$/, "")
            : link
    );

    cleanLinks.forEach((link, i) => {
        const display = link.replace(/^.*\//g, " ");
        log(
            [LogStyle.bold, LogStyle.green],
            i ? `+ ${`${index}/${total}`.padStart(13)}`
              : "HIT",
            `${i ? " ".repeat(54) : cityLink.padStart(53) + ":"} ${names[i].padEnd(6)} --> ${display}`
        );
    });

    return cleanLinks;
}

export async function scrapeWiki(voivodeships: Map<Voivodeship>) {
    timeStart("scraper");
    log([LogStyle.blue, LogStyle.bold], "SCRAPER", "Preparing scraping");

    await ensureExists(paths.COA);
    await ensureExists(paths.backgrounds);

    const voivodeshipNames = Object.keys(voivodeships);

    let cities = voivodeshipNames.flatMap(voivodeship =>
        voivodeships[voivodeship].map(city => ({
            ...city,
            voivodeship
        }))
    ) as (City & { voivodeship: string })[];

    const totalEntries = cities.length;

    try {
        const coaFiles = await readdir(paths.COA);
        const backgroundFiles = await readdir(paths.backgrounds);

        const existing = backgroundFiles
            .map(file => parsePath(file).name)
            .filter(name => coaFiles.some(coa => coa.startsWith(name)));

        cities = cities.filter(city => !existing.includes(formatFileName(city)));
    } catch (err) {
        log(
            [LogStyle.red, LogStyle.bold],
            "ERROR",
            "Couldn't read background/COA directories",
            err
        );
    }

    if (cities.length < totalEntries) {
        log(
            [LogStyle.cyan],
            "SCRAPER",
            `Skipping ${totalEntries - cities.length} existing cities`
        );
    }

    const seenNames: Map<number> = {};
    for (const city of cities) {
        seenNames[city.name] = (seenNames[city.name] ?? 0) + 1;
    }
    for (const city of cities) {
        if (seenNames[city.name] > 1) city.repeating = true;
    }

    log([LogStyle.blue, LogStyle.bold], "SCRAPER", "Starting scraping process");

    const regexesNames = ["COA", "Image"];
    const regexesStripThumb = [false, true];
    const regexesList = [
        [/<img .*?alt="Herb" .*?src="(.+?)".*?>/, /<tr class="grafika iboxs.*?<img .*?src="(.+?)".*?>/s],             // main match
        [/<img .*?alt="Herb" .*?src="(.+?)".*?>/, /.*<figure .*?typeof="mw:File\/Thumb".*?<img .*?src="(.+?)".*?>/s], // fallback for missing headers
        [/<img .*?src="(.+?COA.+?)".*?>/, /<img .*?alt="Ilustracja" .*?src="(.+?)".*?>/i],                            // edge cases (e.g. Solec nad Wisłą)
    ];

    let downloads: Promise<void>[] = [];
    let pending = 0;
    let errors = 0;
    let waiting = false;

    function trackPending() {
        pending--;
        if (!waiting) return;

        log(
            [LogStyle.cyan],
            `SCRAPER${(Math.floor(100 * (totalEntries - pending / 2) / totalEntries) + "%").padStart(8, " ")}`,
            `Waiting for downloads: ${pending} remaining...`
        );
    }

    for (const [i, city] of cities.entries()) {
        let found = false;
        let attempt = 1;

        if (city.repeating) {
            log([LogStyle.yellow, LogStyle.bold], "REPEATING", `Trying reversed suffixes for '${city.name}'`);
        }

        for (const regexes of regexesList) {
            const suffixes = city.repeating
                ? [`_(powiat ${city.powiat})`, `_(województwo_${city.voivodeship})`, "_(miasto)", ""]
                : ["", "_(miasto)", `_(województwo_${city.voivodeship})`, `_(powiat_${city.powiat})`];

            for (const suffix of suffixes) {
                const result = await tryPage(
                    city.name,
                    suffix,
                    regexes,
                    regexesNames,
                    regexesStripThumb,
                    i + 1,
                    cities.length
                ).catch(err => {
                    log([LogStyle.yellow], `NO HIT (#${attempt++})`, err.message);
                });

                if (!result) continue;

                found = true;
                attempt = 1;

                const [coa, background] = result;

                const onError = (err: Error) => {
                    log([LogStyle.red, LogStyle.bold], `ERROR`, `Failed to download ${city.name}`, err);
                };

                downloads.push(
                    downloadFile(coa, formatFileName(city), paths.COA)
                        .then(trackPending)
                        .catch(onError)
                );
                downloads.push(
                    downloadFile(background, formatFileName(city), paths.backgrounds)
                        .then(trackPending)
                        .catch(onError)
                );

                pending += 2;
                break;
            }

            if (found) break;
        }

        if (!found) {
            log([LogStyle.bold, LogStyle.red], "ERROR", `No results for ${city.name}`);
            errors++;
        }
    }

    waiting = true;
    log([LogStyle.cyan], "SCRAPER", `Waiting for downloads: ${pending} remaining...`);

    await Promise.all(downloads);

    log(
        [LogStyle.blue, LogStyle.bold],
        "SCRAPER",
        `Scraping complete\n${(cities.length - errors).toString().green()} found\n${errors.toString().red()} errors`
    );

    timeEnd("scraper");

    if (errors) {
        log([LogStyle.italic, LogStyle.red], "EXITING", "Exiting due to errors...");
        process.exit(1);
    }
}
