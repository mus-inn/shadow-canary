import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    outDir: 'dist',
  },
  {
    entry: ['src/edge.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'dist',
  },
]);
