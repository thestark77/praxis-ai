import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInstall } from '../../src/lib/install.js';
import { resolvePaths } from '../../src/lib/paths.js';
import { PRAXIS_NATIVE_SKILLS } from '../../src/data/praxis-native-skills.js';
import { isPraxisOwnedNativeSkillFile } from '../../src/lib/ownership.js';
import {
  ALWAYS_LOADED_BUDGET_BYTES,
  IMPORT_BUDGET_BYTES,
  renderImports,
  skillListingBytes,
} from '../helpers/always-loaded.js';

// Drives a real install from the shipped templates and measures what a fresh
// machine would actually load: the @-import payload under ~/.praxis, and the
// skills the installer dropped into ~/.claude/skills.

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const templatesRoot = join(repoRoot, 'templates', 'praxis-home');
const claudeSkillsTemplatesRoot = join(repoRoot, 'templates', 'claude-skills');

const OVERLAY_SKILLS = PRAXIS_NATIVE_SKILLS.filter((s) => s.name.startsWith('praxis-')).map(
  (s) => s.name,
);

const savedPraxisHome = process.env.PRAXIS_HOME;
afterEach(() => {
  if (savedPraxisHome === undefined) delete process.env.PRAXIS_HOME;
  else process.env.PRAXIS_HOME = savedPraxisHome;
});

async function installFresh(): Promise<ReturnType<typeof resolvePaths>> {
  const home = await mkdtemp(join(tmpdir(), 'praxis-slim-'));
  process.env.PRAXIS_HOME = home;
  const paths = resolvePaths(home);
  await mkdir(paths.claudeDir, { recursive: true });
  await writeFile(paths.claudeMd, '# my notes\n', 'utf8');
  await writeFile(paths.settingsJson, JSON.stringify({ permissions: { deny: [] } }), 'utf8');
  await runInstall({
    paths,
    agents: 'claude-code',
    bootstrapGentleAi: false,
    templatesRoot,
    claudeSkillsTemplatesRoot,
  });
  return paths;
}

describe('a fresh install loads the slim always-loaded layer', () => {
  it('every @-import resolves in the installed home and the payload fits the budget', async () => {
    const paths = await installFresh();
    // renderImports throws on a missing file, so a dangling import fails here.
    const files = await renderImports(paths.praxisDir);
    expect(files.length).toBeGreaterThan(5);
    const total = files.reduce((sum, f) => sum + f.bytes, 0);
    expect(total, `installed imports total ${total} bytes`).toBeLessThanOrEqual(
      IMPORT_BUDGET_BYTES,
    );
  });

  it('installs every overlay skill as a praxis-owned, auto-loadable skill', async () => {
    const paths = await installFresh();
    expect(OVERLAY_SKILLS.length).toBeGreaterThanOrEqual(8);
    for (const name of OVERLAY_SKILLS) {
      const content = await readFile(join(paths.claudeSkillsDir, name, 'SKILL.md'), 'utf8');
      expect(isPraxisOwnedNativeSkillFile(content, name), `${name} not praxis-owned`).toBe(true);
      expect(content, `${name} would be hidden from the model`).not.toContain(
        'disable-model-invocation',
      );
    }
  });

  it('stays under the combined budget once the installed skill listing is counted', async () => {
    const paths = await installFresh();
    let total = (await renderImports(paths.praxisDir)).reduce((sum, f) => sum + f.bytes, 0);
    for (const name of OVERLAY_SKILLS) {
      total += await skillListingBytes(paths.claudeSkillsDir, name);
    }
    expect(total, `installed always-loaded total ${total} bytes`).toBeLessThanOrEqual(
      ALWAYS_LOADED_BUDGET_BYTES,
    );
  });
});
