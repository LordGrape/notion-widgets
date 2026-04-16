import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

export default defineConfig({
  define: {
    '__VITE_WIDGET_KEY__': JSON.stringify(process.env.VITE_WIDGET_KEY || ''),
  },
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
