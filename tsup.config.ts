import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/cli/index.ts',
    'ast-hook': 'src/cli/ast-hook.ts',
    'voice-hook': 'src/cli/voice-hook.ts',
    // Side-effect-free engine bundle imported in-process by the OpenCode
    // firewall plugin. Keep it a separate entry: dist/ast-hook.js runs on
    // import and dist/index.js parses argv.
    firewall: 'src/firewall.ts',
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
