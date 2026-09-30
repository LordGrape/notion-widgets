import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";

export default defineConfig({
	root: resolve(__dirname, "app"),
	plugins: [viteSingleFile({ removeViteModuleLoader: true })],
	build: {
		outDir: resolve(__dirname, "build"),
		emptyOutDir: true,
		minify: false,
		rollupOptions: {
			input: resolve(__dirname, "app/index.html"),
			output: {
				entryFileNames: "studyengine.js",
			},
		},
	},
});
