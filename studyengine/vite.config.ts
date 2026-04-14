import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import preact from '@preact/preset-vite';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Custom plugin to inline non-module scripts
function inlineScriptsPlugin() {
  return {
    name: 'inline-scripts',
    enforce: 'post',
    transformIndexHtml(html) {
      // Match all script tags with src attribute that point to local js files
      const scriptRegex = /<script src="(js\/[^"]+)"><\/script>/g;
      let result = html;
      let match;

      while ((match = scriptRegex.exec(html)) !== null) {
        const src = match[1];
        const filePath = resolve(__dirname, src);

        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          // Replace the script tag with an inline script
          result = result.replace(match[0], `<script>\n${content}\n</script>`);
        }
      }

      return result;
    }
  };
}

export default defineConfig({
  plugins: [
    // Filter out the broken transform-hook-names sub-plugin (zimmerframe exports bug)
    ...((preact() as unknown as any[]).flat().filter(
      (p: any) => p && p.name !== 'preact:transform-hook-names'
    )),
    viteSingleFile({ removeViteModuleLoader: true }),
    inlineScriptsPlugin()
  ],
  esbuild: {
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  },
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
