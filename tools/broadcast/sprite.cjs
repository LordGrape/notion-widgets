/* Pack rendered scene frames into the loading-screen sprite sheets.
   Run: node tools/broadcast/sprite.cjs <outdir>/scenes apps/assistant [frame-width]
   Each scene becomes broadcast-<scene>.webp: frames left to right, then top to bottom,
   COLS per row (a single row would pass WebP's 16383 px limit). */
const sharp = require("sharp");
const fs = require("node:fs"), path = require("node:path");
const COLS = 8;
(async () => {
	const [, , src, out, width] = process.argv;
	const scenes = JSON.parse(fs.readFileSync(path.join(src, "scenes.json"), "utf8"));
	const quality = Number(process.env.SPRITE_QUALITY || 80);
	for (const [name, { frames, fps }] of Object.entries(scenes)) {
		const files = Array.from({ length: frames }, (_, f) => path.join(src, `${name}_${String(f).padStart(2, "0")}.png`));
		const meta = await sharp(files[0]).metadata();
		const w = Number(width) || meta.width, h = Math.round((w * meta.height) / meta.width);
		const cols = Math.min(COLS, frames), rows = Math.ceil(frames / cols);
		/* The shadow catcher leaves a faint, wide film of alpha that lossy WebP turns into grey blotches
		   on a light page. Fade out everything under FLOOR (of 255) and rescale the rest. */
		const FLOOR = Number(process.env.SPRITE_ALPHA_FLOOR || 12);
		const tiles = await Promise.all(files.map(async (file) => {
			const { data, info } = await sharp(file).resize(w, h).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
			for (let i = 3; i < data.length; i += 4) data[i] = Math.max(0, Math.round(((data[i] - FLOOR) * 255) / (255 - FLOOR)));
			return sharp(data, { raw: info }).png().toBuffer();
		}));
		const file = path.join(out, `broadcast-${name}.webp`);
		await sharp({ create: { width: w * cols, height: h * rows, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
			.composite(tiles.map((input, i) => ({ input, left: (i % cols) * w, top: Math.floor(i / cols) * h })))
			.webp({ quality, alphaQuality: Number(process.env.SPRITE_ALPHA || 80), effort: 6, smartSubsample: true })
			.toFile(file);
		console.log(`${name}: ${frames} frames at ${fps} fps, ${cols}x${rows} of ${w}x${h}, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
	}
})();
