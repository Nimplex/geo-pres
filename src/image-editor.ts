import { Jimp } from "jimp";

async function editImage(path: string) {
    // 10 inches at 96 dpi is 960px, 1.125 inches at 96 dpi is 108px;
    const canvas = new Jimp({ width: 960, height: 108, color: 0x000000ff });

    const image = await Jimp.read("https://upload.wikimedia.org/wikipedia/commons/7/7a/Rynek_Ko%C5%9Bciuszki%2C_Bia%C5%82ystok_%282%29.jpg");

    const aspectRatio = image.width / image.height;
    const newWidth = aspectRatio * canvas.height;

    image.resize({ w: newWidth, h: canvas.height });

    const times = Math.round(canvas.width / newWidth);

    for (let i = 1; i <= times; i++) {
	image.flip({ horizontal: true, vertical: false });

    	canvas.composite(image, (i - 1) * newWidth, 0);
    }
    return canvas.write("image.test.png");
}

await editImage("");
