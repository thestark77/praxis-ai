import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VERSION } from '../../src/version.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// alpha.17 shipped announcing itself as alpha.16: the version was typed into
// src/cli/index.ts as a second copy, and `npm version` moved package.json
// without it. Nothing failed, nothing was noticed until someone read the
// output of `praxis --version` against what npm had actually installed.

describe('the CLI version', () => {
  it('is not a second copy typed into the source', async () => {
    const source = await readFile(join(repoRoot, 'src', 'cli', 'index.ts'), 'utf8');
    expect(source).not.toMatch(/\d+\.\d+\.\d+(-[\w.]+)?/);
  });

  it('is injected by the build, from package.json', async () => {
    const config = await readFile(join(repoRoot, 'tsup.config.ts'), 'utf8');
    expect(config).toContain('__PRAXIS_VERSION__');
    expect(config).toContain('package.json');
  });

  it('falls back to a marker rather than a stale number when unbuilt', () => {
    // Running from source has no substitution. Reporting a plausible-looking
    // version there would be worse than admitting there is none.
    expect(VERSION).toBe('0.0.0-dev');
  });
});
