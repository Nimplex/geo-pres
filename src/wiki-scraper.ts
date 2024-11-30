import wiki from "wikipedia";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dataDirPath, parse, readData } from "./parser";
import { error, log, ready, warn } from "./logger";

export const downloadsPath = join(dataDirPath, "coats-of-arms");

async function fetchHerb(cityName: string) {
    const res = await wiki.page(cityName);

    const media = await res.media();

    const imageData = media.items.filter((x) => new RegExp(/Herb|COA/g).test(x.title || ""));

    if (!imageData[0])
        throw new Error("Cannot find coats of arms on wiki page");

    return `https:${imageData[0].srcset[0].src}`;
}

async function downloadFile(URL: string, cityName: string) {
    const res = await fetch(URL);

    const buffer = await res.arrayBuffer();

    await writeFile(join(downloadsPath, cityName.replaceAll(" ", "-") + ".png"), Buffer.from(buffer));
}

async function main() {
    wiki.setLang("pl");

    try {
        if (!existsSync(downloadsPath)) {
            warn(`Downloads directory "${downloadsPath}" doesn't exist, creating one for you`);
            await mkdir(downloadsPath);
        }
    } catch (err) {
        error("Couldn't create downloads directory, exiting");
        return process.exit(1);
    }

    const maxRequestsPerHour = 400;

    const data = await readData();
    const voivodeships = parse(data);

    const cities = Object.values(voivodeships).flat();

    log("This program is designed not to exceed ratelimits of wikipedia");
    log(`There are ${cities.length} cities in data file`);
    log(`The scraping process will take around ${cities.length / 500} hours`);

    let i = 0;

    await new Promise(function (resolve, _) {
        const interval = setInterval(async function () {
            const city = cities[i++]; // also increment index

            if (!city) {
                clearInterval(interval);
                resolve(null);
            }

            try {
                const herbSource = await fetchHerb(city.cityName);

                log(`Coats of arms for city: ${city.cityName} found: "${herbSource}", downloading`);

                try {
                    await downloadFile(herbSource, city.cityName);

                    ready(`Downloaded coats of arms for city: ${city.cityName}`);
                } catch (err) {
                    error(`Couldn't download coat of arms for: ${city.cityName} (filename: ${herbSource}): ${err}`);
                }
            } catch (err) {
                error(`Couldn't fetch coat of arms for: ${city.cityName}: ${err}`);
            }
        }, Math.round(3600 / maxRequestsPerHour) * 1000);
    });

    log("Scraping finished");
}

await main();
