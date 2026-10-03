const { chromium } = require("playwright");
const fs = require("node:fs"), path = require("node:path");
(async () => {
	const [, , src, out, fw, fh] = process.argv;
	const b = await chromium.launch(); const p = await b.newPage();
	const data = "data:image/png;base64," + fs.readFileSync(src).toString("base64");
	const quality = Number(process.env.SPRITE_QUALITY || 0.86);
	const webp = await p.evaluate(async ([data, fw, fh, quality]) => {
		const img = new Image(); img.src = data; await img.decode();
		const frames = Math.round(img.width / (img.height * (300 / 330)));
		const c = document.createElement("canvas"); c.width = fw * frames; c.height = fh;
		c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
		return { url: c.toDataURL("image/webp", quality), frames };
	}, [data, Number(fw), Number(fh), quality]);
	fs.writeFileSync(out, Buffer.from(webp.url.split(",")[1], "base64"));
	console.log("frames", webp.frames, "bytes", fs.statSync(out).size);
	await b.close();
})();
