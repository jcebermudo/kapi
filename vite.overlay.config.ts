import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'

// Bundles the browser overlay (+ its CSS) into one dependency-free ESM file
// so non-Vite dev servers (e.g. Next.js) can serve it as a static asset
// without needing to understand Vite's `?inline` CSS import syntax.
export default defineConfig({
  build: {
    outDir: 'dist/browser',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/browser/overlay.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'overlay-standalone.js',
    },
  },
})
