import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'node18',
  clean: true,
  splitting: false,
  sourcemap: true,
  shims: false,
  dts: false,
});
