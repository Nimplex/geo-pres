import { join } from "node:path";
import pptxgen from "pptxgenjs";

async function generatePresentation() {
    const presentation = new pptxgen();
    presentation.layout = "LAYOUT_16x9";

    const titleSlide = presentation.addSlide();
    titleSlide.addText("Wszystkie miasta Polski", {
        align: "center",
        valign: "middle",
        x: 0,
        y: 0,
        h: "100%",
        w: "100%",
        fontSize: 36,
        fontFace: "Work Sans",
        bold: true,
    });

    let currentSlide: pptxgen.Slide;
    let i = 0;

    for (const voivodeshipName of Object.keys(voivodeships)) {
        const voivodeshipTitleSlide = presentation.addSlide();
        voivodeshipTitleSlide.addText(voivodeshipName, {
            align: "center",
            valign: "middle",
            x: 0,
            y: 0,
            h: "100%",
            w: "100%",
            fontSize: 36,
            fontFace: "Work Sans",
            color: "#ffffff",
            bold: true,
        });
        voivodeshipTitleSlide.background = { color: "#000000" };

        for await (const city of voivodeships[voivodeshipName]) {
            if (i % 5 == 0) currentSlide = presentation.addSlide();

            currentSlide!.background = { color: "#000000" };

            const y = 1.125 * (i++ % 5);

            currentSlide!.addShape(presentation.ShapeType.rect, {
                x: 0,
                y,
                h: 1.125,
                w: "100%",
                fill: { color: "#0f0f0f" }
            });

            currentSlide!.addText(city.cityName, {
                valign: "middle",
                x: 0,
                y,
                h: 1.125,
                w: "40%",
                fontSize: 14,
                color: "#ffffff",
            });

            // console.log("Processing image for: ", city.cityName)

            // const imageURL = await fetchHerb(city.cityName);
            // const res = await imageUrlToBase64(imageURL);

            // currentSlide!.addImage({
            //     data: res,
            //     h: 0.875,
            //     y: y + 0.125,
            //     x: 8
            // })
        };
    }

    await presentation.writeFile({
        fileName: join(import.meta.dir, "..", "data", "presentation.pptx"),
    });
}

async function main() {
    await generatePresentation();
}

await main();