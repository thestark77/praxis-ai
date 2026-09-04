import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

// The version the CLI reports comes from package.json at build time. It used
// to be a second copy typed into src/cli/index.ts, and alpha.17 shipped
// announcing itself as alpha.16 because `npm version` moved one and not the
// other. Two sources of truth for the same fact is one too many.
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  define: {
    __PRAXIS_VERSION__: JSON.stringify(version),
  },
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
