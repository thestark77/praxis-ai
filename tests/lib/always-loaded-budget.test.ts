import { describe, it, expect } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PRAXIS_NATIVE_SKILLS } from '../../src/data/praxis-native-skills.js';
import {
  ALWAYS_LOADED_BUDGET_BYTES,
  IMPORT_BUDGET_BYTES,
  MAX_LINES_PER_FILE,
  renderImports as renderImportsFrom,
  skillListingBytes as skillListingBytesFrom,
} from '../helpers/always-loaded.js';

// The payload main.md pulls into every turn, rendered the way Claude Code
// expands it (see tests/helpers/always-loaded.ts for the budgets and why).

const pkgRoot = join(import.meta.dirname, '..', '..');
const homeRoot = join(pkgRoot, 'templates', 'praxis-home');
const skillsRoot = join(pkgRoot, 'templates', 'claude-skills');

const renderImports = () => renderImportsFrom(homeRoot);
const skillListingBytes = (name: string) => skillListingBytesFrom(skillsRoot, name);

/** Modules that moved out of praxis-home into skills (or were merged into one). */
const MOVED_MODULES = [
  'grilling.md',
  'context-conventions.md',
  'command-handoff.md',
  'workflow-policy.md',
  'effort-policy.md',
  'context-budget.md',
  'upstream-first-debugging.md',
  'browser-testing-policy.md',
] as const;

const OVERLAY_SKILLS = PRAXIS_NATIVE_SKILLS.filter((s) => s.name.startsWith('praxis-')).map(
  (s) => s.name,
);

describe('always-loaded praxis payload', () => {
  it('renders main.md and its imports under the byte budget', async () => {
    const files = await renderImports();
    // Guard the guard: a broken walker must not pass on an empty payload.
    expect(files.length).toBeGreaterThan(5);
    const total = files.reduce((sum, f) => sum + f.bytes, 0);
    expect(total, `imports total ${total} bytes (${files.length} files)`).toBeLessThanOrEqual(
      IMPORT_BUDGET_BYTES,
    );
  });

  it('stays under budget once the skill-listing lines are counted', async () => {
    const files = await renderImports();
    let total = files.reduce((sum, f) => sum + f.bytes, 0);
    for (const name of OVERLAY_SKILLS) total += await skillListingBytes(name);
    expect(total, `always-loaded total ${total} bytes`).toBeLessThanOrEqual(
      ALWAYS_LOADED_BUDGET_BYTES,
    );
  });

  it('keeps every always-loaded file under the line limit', async () => {
    for (const f of await renderImports()) {
      expect(f.lines, `${f.path} has ${f.lines} lines`).toBeLessThanOrEqual(MAX_LINES_PER_FILE);
    }
  });

  it('no longer imports or ships the modules that moved to skills', async () => {
    const files = await renderImports();
    const imported = files.map((f) => f.path);
    for (const moved of MOVED_MODULES) {
      expect(imported, `${moved} is still imported`).not.toContain(moved);
      await expect(stat(join(homeRoot, moved)), `${moved} still ships`).rejects.toThrow();
    }
  });

  it('has no dangling reference to a moved module in always-loaded text or skills', async () => {
    const texts = (await renderImports()).map((f) => ({ where: f.path, text: f.text }));
    for (const name of OVERLAY_SKILLS) {
      texts.push({
        where: `skill ${name}`,
        text: await readFile(join(skillsRoot, name, 'SKILL.md'), 'utf8'),
      });
    }
    for (const { where, text } of texts) {
      for (const moved of MOVED_MODULES) {
        expect(text, `${where} still points at ${moved}`).not.toContain(moved);
      }
    }
  });
});

describe('main.md on-demand skills index', () => {
  it('names every overlay skill so the model knows what lives where', async () => {
    const main = await readFile(join(homeRoot, 'main.md'), 'utf8');
    expect(OVERLAY_SKILLS.length).toBeGreaterThanOrEqual(8);
    for (const name of OVERLAY_SKILLS) {
      expect(main, `main.md does not index ${name}`).toContain(`\`${name}\``);
    }
  });

  it('keeps the one-line invariant for each relocated rule family', async () => {
    const flat = (await readFile(join(homeRoot, 'main.md'), 'utf8')).replace(/\s+/g, ' ');
    // command handoff
    expect(flat).toContain('absolute paths');
    expect(flat).toContain('PEGA_AQUI_TU_API_KEY');
    expect(flat).toContain('never print, echo, log, or read back a secret');
    // context guard: the trust boundary must hold even if the skill never loads
    expect(flat).toContain('[IRIS CONTEXT GUARD]');
    expect(flat).toContain('its own controller turn');
    expect(flat).toContain('between 50% and 60%');
    // delegation
    expect(flat).toContain('at most 4 concurrent writers');
    expect(flat).toContain('never deliver from inside a workflow');
    expect(flat).toContain('`medium`');
    // upstream debugging and browser testing
    expect(flat).toContain('open and closed');
    expect(flat).toContain("needs the user's explicit OK");
    expect(flat).toContain('`browser-use`');
    expect(flat).toContain('untrusted data');
  });

  it('tells the model to load the skill before acting', async () => {
    const flat = (await readFile(join(homeRoot, 'main.md'), 'utf8')).replace(/\s+/g, ' ');
    expect(flat).toContain('load the skill BEFORE acting');
  });
});

describe('trimmed always-loaded modules keep their invariants', () => {
  it('irreversibility-firewall keeps the guard-evasion bans and anticipatory pauses', async () => {
    const text = (await readFile(join(homeRoot, 'irreversibility-firewall.md'), 'utf8')).replace(
      /\s+/g,
      ' ',
    );
    expect(text).toContain('Guard-evasion bans');
    expect(text).toContain('Never invoke `git` by an absolute or relative path');
    expect(text).toContain('Never read, print, copy, or exfiltrate a bypass token');
    expect(text).toContain('Never use `-D`');
    expect(text).toContain('Anticipatory pauses');
    expect(text).toContain('Irreversible action → pause and confirm');
    // The protocol itself now lives in a skill; a short summary and a pointer stay.
    expect(text).toContain('Do NOT auto-retry without the dangerous flag');
    expect(text).toContain('`praxis-firewall-protocol`');
  });

  it('precedence-rules keeps domain ownership and the conflict rule', async () => {
    const text = (await readFile(join(homeRoot, 'precedence-rules.md'), 'utf8')).replace(
      /\s+/g,
      ' ',
    );
    expect(text).toContain('Praxis-ai governs');
    expect(text).toContain('Gentle-ai governs');
    expect(text).toContain('praxis-ai wins');
    expect(text).toContain('`praxis-overlay-reference`');
  });

  it('balanced preset points at the poll window and the skill that holds the full text', async () => {
    const text = (await readFile(join(homeRoot, 'presets', 'balanced.md'), 'utf8')).replace(
      /\s+/g,
      ' ',
    );
    expect(text).not.toContain('Warn at 75%');
    expect(text).toContain('between 50% and 60%');
    expect(text).toContain('`praxis-context-guard`');
    expect(text).toContain('NON-TRIVIAL if ≥2 signals');
    expect(text).toContain('`praxis-overlay-reference`');
  });

  it('engineering-discipline names the browser-testing skill instead of the moved module', async () => {
    const text = await readFile(join(homeRoot, 'engineering-discipline.md'), 'utf8');
    expect(text).toContain('`praxis-browser-testing`');
  });
});
