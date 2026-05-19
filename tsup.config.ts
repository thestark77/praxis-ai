import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/cli/index.ts',
    'ast-hook': 'src/cli/ast-hook.ts',
  },
  format: ['esm'],
  outDir: 'dist',
  target: 'node18',
  clean: true,
  splitting: false,
  sourcemap: true,
  shims: false,
  dts: false,
});
