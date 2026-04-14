import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    rollupOptions: {
      input: 'studyengine.html',
      output: {
        entryFileNames: 'studyengine.js',
      },
    },
  },
});
