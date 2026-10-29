import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build inlines every model, texture and font so dist/index.html opens
// straight from disk (double-click) with no server.
export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 50_000,
    cssCodeSplit: false,
  },
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
});
