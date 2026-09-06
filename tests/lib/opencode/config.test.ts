import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readOpenCodeConfig,
  configHasComments,
  writeOpenCodeConfig,
  resolveConfigFile,
  addPraxisInstructions,
  removePraxisInstructions,
  hasPraxisInstructions,
  isPraxisInstruction,
  OPENCODE_SCHEMA_URL,
} from '../../../src/lib/opencode/config.js';

async function sandbox(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-oc-config-'));
  await mkdir(dir, { recursive: true });
  return dir;
}

describe('readOpenCodeConfig', () => {
  it('treats a missing file as an empty config', async () => {
    const dir = await sandbox();
    expect(await readOpenCodeConfig(join(dir, 'opencode.json'))).toEqual({});
  });

  it('refuses to guess at malformed JSON', async () => {
    const dir = await sandbox();
    const path = join(dir, 'opencode.json');
    await writeFile(path, '{ "permission": { "bash": } }', 'utf8');
    await expect(readOpenCodeConfig(path)).rejects.toThrow(/not valid JSON/);
  });

  it('reads a JSONC config with comments and trailing commas', async () => {
    // OpenCode accepts these, so a praxis that cannot read them reports a
    // fully armed firewall as disarmed.
    const dir = await sandbox();
    const path = join(dir, 'opencode.jsonc');
    await writeFile(
      path,
      '{\n  // the praxis firewall\n  "$schema": "https://opencode.ai/config.json",\n' +
        '  "permission": { "bash": { "rm -rf *": "deny", } },\n}\n',
      'utf8',
    );
    expect(await readOpenCodeConfig(path)).toEqual({
      $schema: 'https://opencode.ai/config.json',
      permission: { bash: { 'rm -rf *': 'deny' } },
    });
  });
});

describe('configHasComments', () => {
  it('is true only when the file would actually lose something on a rewrite', async () => {
    const dir = await sandbox();
    const commented = join(dir, 'a.jsonc');
    const plain = join(dir, 'b.json');
    await writeFile(commented, '{ // note\n "a": 1 }', 'utf8');
    await writeFile(plain, '{ "$schema": "https://opencode.ai/config.json" }', 'utf8');
    expect(await configHasComments(commented)).toBe(true);
    expect(await configHasComments(plain)).toBe(false);
    expect(await configHasComments(join(dir, 'missing.json'))).toBe(false);
  });
});

describe('writeOpenCodeConfig', () => {
  it('adds the schema URL when the file had none and keeps an existing one', async () => {
    const dir = await sandbox();
    const path = join(dir, 'opencode.json');
    await writeOpenCodeConfig(path, { permission: { bash: { '*': 'allow' } } });
    const written = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    expect(written.$schema).toBe(OPENCODE_SCHEMA_URL);

    await writeOpenCodeConfig(path, { $schema: 'https://example.com/x.json' });
    const second = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    expect(second.$schema).toBe('https://example.com/x.json');
  });

  it('round-trips foreign keys such as agent and mcp untouched', async () => {
    const dir = await sandbox();
    const path = join(dir, 'opencode.json');
    const original = {
      $schema: OPENCODE_SCHEMA_URL,
      agent: { gentleman: { mode: 'primary', prompt: '{file:./AGENTS.md}' } },
      mcp: { engram: { type: 'local' } },
    };
    await writeFile(path, JSON.stringify(original), 'utf8');
    const config = await readOpenCodeConfig(path);
    await writeOpenCodeConfig(path, config);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(original);
  });
});

describe('resolveConfigFile', () => {
  it('prefers an existing opencode.jsonc over the default .json name', async () => {
    const dir = await sandbox();
    const paths = {
      opencodeJson: join(dir, 'opencode.json'),
      opencodeJsonc: join(dir, 'opencode.jsonc'),
    };
    await writeFile(paths.opencodeJsonc, '{}', 'utf8');
    expect(await resolveConfigFile(paths)).toBe(paths.opencodeJsonc);
  });

  it('prefers .jsonc when both exist, because that is the file OpenCode lets win', async () => {
    // Verified against opencode 1.18.29: with both files present it merges
    // them, and on a colliding key the .jsonc value wins. Objects such as
    // `permission` deep-merge, but arrays are replaced outright -- so a
    // praxis `instructions` entry written into .json is silently dropped
    // whenever .jsonc declares its own.
    const dir = await sandbox();
    const paths = {
      opencodeJson: join(dir, 'opencode.json'),
      opencodeJsonc: join(dir, 'opencode.jsonc'),
    };
    await writeFile(paths.opencodeJson, '{}', 'utf8');
    await writeFile(paths.opencodeJsonc, '{}', 'utf8');
    expect(await resolveConfigFile(paths)).toBe(paths.opencodeJsonc);
  });

  it('falls back to .json when neither exists', async () => {
    const dir = await sandbox();
    const paths = {
      opencodeJson: join(dir, 'opencode.json'),
      opencodeJsonc: join(dir, 'opencode.jsonc'),
    };
    expect(await resolveConfigFile(paths)).toBe(paths.opencodeJson);
  });
});

describe('instructions patching', () => {
  it('appends the overlay last so recency favours praxis', () => {
    const patched = addPraxisInstructions(
      { instructions: ['./CONTRIBUTING.md'] },
      '/home/tester/.praxis/main.md',
    );
    expect(patched.instructions).toEqual(['./CONTRIBUTING.md', '/home/tester/.praxis/main.md']);
  });

  it('is idempotent and rewrites a stale overlay path in place', () => {
    const once = addPraxisInstructions({}, '/old/.praxis/main.md');
    const twice = addPraxisInstructions(once, '/new/.praxis/main.md');
    expect(twice.instructions).toEqual(['/new/.praxis/main.md']);
  });

  it('recognises the overlay written in any path form', () => {
    expect(isPraxisInstruction('~/.praxis/main.md')).toBe(true);
    expect(isPraxisInstruction('C:\\Users\\tester\\.praxis\\main.md')).toBe(true);
    expect(isPraxisInstruction('/home/tester/.praxis/main.md')).toBe(true);
    expect(isPraxisInstruction('/home/tester/notes/main.md')).toBe(false);
  });

  it('removes the entry and drops an emptied instructions array', () => {
    const patched = addPraxisInstructions({}, '~/.praxis/main.md');
    expect(hasPraxisInstructions(patched)).toBe(true);
    const removed = removePraxisInstructions(patched);
    expect(removed.removed).toBe(true);
    expect(removed.config.instructions).toBeUndefined();
  });

  it('keeps foreign instruction entries on removal', () => {
    const patched = addPraxisInstructions({ instructions: ['./docs/x.md'] }, '~/.praxis/main.md');
    const removed = removePraxisInstructions(patched);
    expect(removed.config.instructions).toEqual(['./docs/x.md']);
  });

  it('reports no removal when praxis was never there', () => {
    const removed = removePraxisInstructions({ instructions: ['./docs/x.md'] });
    expect(removed.removed).toBe(false);
  });
});
