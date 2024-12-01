import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dataDirPath, parse, readData } from "./parser";
import { error, log, ready, warn } from "./logger";
import type { City } from "./types";

export const downloadsPath = join(dataDirPath, "coats-of-arms");

async function fetchHerb(city: City): Promise<string> {
	if (!city.voivodeship)
		throw new Error("No voivodeship parameter set");

	return city.cityName;
}

async function downloadFile(URL: string, cityName: string) {
    const res = await fetch(URL);

    const buffer = await res.arrayBuffer();

    await writeFile(join(downloadsPath, cityName.replaceAll(" ", "+") + ".png"), Buffer.from(buffer));
}

async function main() {
    try {
        if (!existsSync(downloadsPath)) {
            warn(`Downloads directory "${downloadsPath}" doesn't exist, creating one for you`);
            await mkdir(downloadsPath);
        }
    } catch (err) {
        error("Couldn't create downloads directory, exiting");
        return process.exit(1);
    }

    const data = await readData();
    const voivodeships = parse(data);

    let cities = Object.keys(voivodeships).map(voivode => voivodeships[voivode].map(city => Object.assign(city, { voivodeship: voivode }))).flat();
    const originalSize = cities.length;

    /* reimplement, misses few cities
    try {
        const files = readdirSync(downloadsPath).map((filename) =>
            filename.replaceAll(".png", "").replaceAll("+", " ")
        );
        cities = cities.filter((city) => !files.includes(city.cityName));
    } catch (err) {
        error(`Couldn't read ${downloadsPath} for existing coats of arms`);
    }
    */

    log("This program is designed not to exceed ratelimits of wikipedia");
    log(`There are ${originalSize} cities in data file`);

    if (cities.length != originalSize)
        warn(`Found ${originalSize - cities.length} existing coats of arms, downloading missing ${cities.length}`);

    let cityIndex = 0;
    let failed = 0;

    async function next() {
        const city = cities[cityIndex++]; // also increment index

        if (!city) return true;

        log(`Scraping ${city.cityName}`);

        try {
            const herbSource = await fetchHerb(city);

            log(`Coats of arms for: ${city.cityName} found: "${herbSource}", downloading`);

            try {
                await downloadFile(herbSource, city.cityName);

                ready(`Downloaded coats of arms for: ${city.cityName}`);
            } catch (err) {
                error(`Couldn't download coats of arms for: ${city.cityName} (filename: ${herbSource}): ${err}`);
                failed++;
            }
        } catch (err) {
            error(`Couldn't fetch coats of arms for: ${city.cityName}: ${err}`);
            failed++;
        }

        return false;
    }

    while (cityIndex != cities.length) {
        if (await next()) break;
    }

    log(
        `Scraping finished, \x1b[92m${cityIndex - failed} scraped\x1b[m, \x1b[31m${failed} failed\x1b[m, ${Math.round(
            (failed / cityIndex) * 100
        )}% loss`
    );
}

await main();
