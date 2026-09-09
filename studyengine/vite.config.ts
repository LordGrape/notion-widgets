import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

export default defineConfig({
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      input: resolve(__dirname, 'studyengine.html'),
      output: {
        entryFileNames: 'studyengine.js',
      },
    },
  },
});
