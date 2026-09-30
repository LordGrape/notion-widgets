import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
const result = await build({
	entryPoints: [new URL("src/main.jsx", import.meta.url).pathname],
	bundle: true,
	minify: true,
	format: "iife",
	target: ["es2020"],
	write: false,
	legalComments: "eof",
	define: { "process.env.NODE_ENV": '"production"' },
});
const css = await readFile(new URL("src/ui.css", import.meta.url), "utf8");
const raw =
	result.outputFiles[0].text +
	`\n;(()=>{const style=document.createElement('style');style.id='todo-ui-styles';style.textContent=${JSON.stringify(css)};document.head.appendChild(style)})();\n`;
const output = raw.replace(/[ \t]+$/gm, "");
const path = new URL("../../todo-ui.js", import.meta.url);
if (process.argv.includes("--check")) {
	if ((await readFile(path, "utf8")) !== output)
		throw new Error("todo-ui.js is stale. Run npm run build in apps/todo.");
} else await writeFile(path, output);
