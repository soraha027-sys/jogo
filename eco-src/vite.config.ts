import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // o GitHub Pages do repo serve a branch: o build vai direto pra pasta publicada
  build: { target: 'es2022', chunkSizeWarningLimit: 900, outDir: '../eco', emptyOutDir: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
