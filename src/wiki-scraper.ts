import wiki, { Page, type mediaResult } from "wikipedia";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dataDirPath, parse, readData } from "./parser";
import { error, log, ready, warn } from "./logger";
import { levenshtein } from "./levenshtein_distance";

export const downloadsPath = join(dataDirPath, "coats-of-arms");

async function fetchHerb(cityName: string) {
    const searchRes = await wiki.search(cityName);

    searchRes.results.reverse();

    if (!searchRes.results[0]) throw new Error("Cannot find city wiki page");

    let i = 0;

    let cityRes: Page | null = null;

    while (true) {
        if (i > searchRes.results.length - 1) throw new Error("Cannot find city wiki page");

        const suggestedPageTitle = searchRes.results[i++].title as string;

        if (suggestedPageTitle.toLowerCase().includes("stacja kolejowa")) continue;

        cityRes = await wiki.page(suggestedPageTitle);

        if (new RegExp(/Strony ujednoznaczniające/g).test((await cityRes.categories()).join(" "))) {
            warn("Detected link list!");

            const pageContent = (await cityRes.html())
                .split("\n")
                .filter((line) => new RegExp(/miasto w.*?woj/g).test(line));
            if (!pageContent[0]) continue;

            const exprRes = new RegExp(/href="([^"]+)"/g).exec(pageContent[0]);
            if (!exprRes || !exprRes[0]) continue;

            warn("This one was tricky, had to go through link list");

            cityRes = await wiki.page(decodeURI(exprRes[0].replaceAll(/href=|["]|\/wiki|[/]/g, "")));

            break;
        }

        if (!cityRes.title.startsWith(cityName)) {
            continue;
        }

        const infobox = await cityRes.infobox();
        if (infobox && infobox.nazwaOryginalna && infobox.nazwaOryginalna != cityName) continue;

        let splittedCitySummary = (await cityRes.summary()).extract.toLowerCase().split("–");

        if (splittedCitySummary[0].startsWith(cityName.toLowerCase())) {
            if (new RegExp(/miasto/).test(splittedCitySummary.slice(1).join("–"))) {
                break;
            }
        }

        splittedCitySummary = (await cityRes.summary()).extract.toLowerCase().split("-");

        if (splittedCitySummary[0].startsWith(cityName.toLowerCase())) {
            if (new RegExp(/miasto/).test(splittedCitySummary.slice(1).join("-"))) {
                break;
            }
        }
    }

    if (!cityRes) throw new Error("Cannot find city wiki page");

    // first check if there's image available in infobox
    const infobox = await cityRes.infobox();
    let infoboxHerb = (infobox.herb as string | null)?.replaceAll(" ", "_");

    const media = await cityRes.media();

    if (infoboxHerb) {
        const url = media.items.filter((item) => {
            if (!item.title) return false;
            return item?.title.includes(infoboxHerb);
        })[0].srcset[0].src;

        return "https:" + url;
    }

    // if not then do this:
    const imageData = media.items.filter((item) => {
        if (!item.title) return false;

        return new RegExp(/herb|coa/g).test(item.title.toLowerCase());
    });

    let selected: mediaResult | null = null;

    // there can be many "Herb" "Coats of arms" on one page, such as city coats
    // of arms and voivodesip coats of arms, so we need to determine which one
    // we want to use
    for (const image of imageData) {
        if (!image.title) continue;

        // remove all crap from file title so we can get closer matches to real images
        // also this match could be a problem if there was a city in Poland with "gm"
        // in its name, but fortunately there aren't any
        const bannedExpr = new RegExp(/herb|gm|gmina/);
        const toReplace = new RegExp(/plik:|file|.svg|.(?<=_)coa|\([^()]*\)|pol(?=_)./g);
        const extractedTitle = image.title
            .toLowerCase()
            .replaceAll(toReplace, "")
            .split("_")
            .filter((part) => !bannedExpr.test(part))
            .join("_");

        const similarity = levenshtein(extractedTitle, cityName);

        if (similarity < 40) continue;

        selected = image;
        warn(`Selected one image for ${cityName}, extracted title: ${extractedTitle} (similarity: ${similarity})`);

        break;
    }

    if (!imageData[0] || !selected) throw new Error("Cannot find coats of arms on wiki page: " + cityRes.fullurl);

    return `https:${imageData[0].srcset[0].src}`;
}

async function downloadFile(URL: string, cityName: string) {
    const res = await fetch(URL);

    const buffer = await res.arrayBuffer();

    await writeFile(join(downloadsPath, cityName.replaceAll(" ", "+") + ".png"), Buffer.from(buffer));
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

    const data = await readData();
    const voivodeships = parse(data);

    let cities = Object.values(voivodeships).flat();
    const originalSize = cities.length;

    try {
        const files = readdirSync(downloadsPath).map((filename) =>
            filename.replaceAll(".png", "").replaceAll("+", " ")
        );
        cities = cities.filter((city) => !files.includes(city.cityName));
    } catch (err) {
        error(`Couldn't read ${downloadsPath} for existing coats of arms`);
    }

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
            const herbSource = await fetchHerb(city.cityName);

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

// ignore that, just for development purposees, some of more tricky ones
async function test() {
    wiki.setLang("pl");

    log(await fetchHerb("Nowe Miasto"));
    log(await fetchHerb("Nowe Miasto Lubawskie"));
    log(await fetchHerb("Nowe Miasto nad Pilicą"));
    log(await fetchHerb("Goraj"));
    log(await fetchHerb("Siedliszcze"));
    log(await fetchHerb("Wrocław"));
    log(await fetchHerb("Wałbrzych"));
    log(await fetchHerb("Lubań"));
    log(await fetchHerb("Jarosław"));
    log(await fetchHerb("Ujazd"));
    log(await fetchHerb("Jawor"));
    log(await fetchHerb("Węgorzyno"));
    log(await fetchHerb("Zwoleń"));
}

// await test();
await main();
