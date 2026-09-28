import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_MD = join(__dirname, '..', '..', 'templates', 'claude-skills', 'away-mode', 'SKILL.md');

interface Frontmatter {
  name?: string;
  description?: string;
  invocation?: string;
  disableModelInvocation?: string;
  argumentHint?: string;
  praxisNative?: string;
}

function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith('---\n')) return {};
  const end = content.indexOf('\n---', 4);
  if (end === -1) return {};
  const block = content.slice(4, end);
  const out: Frontmatter = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key === 'name') out.name = val.trim();
    else if (key === 'description') out.description = val.trim();
    else if (key === 'invocation') out.invocation = val.trim();
    else if (key === 'disable-model-invocation') out.disableModelInvocation = val.trim();
    else if (key === 'argument-hint') out.argumentHint = val.trim();
    else if (key === 'praxis-native') out.praxisNative = val.trim();
  }
  return out;
}

/** Whitespace-normalized, case-insensitive substring match: collapse all
 * whitespace runs to a single space and lowercase before comparing, so
 * wrapping/indentation/sentence-case in the markdown source never breaks a
 * clause assertion. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function containsClause(content: string, clause: string): boolean {
  return normalize(content).includes(normalize(clause));
}

let cachedContent: string | null = null;
async function content(): Promise<string> {
  if (cachedContent === null) {
    cachedContent = await readFile(SKILL_MD, 'utf8');
  }
  return cachedContent;
}

/**
 * The exact slice of content for one `## <heading>` markdown heading, up
 * to the next `## ` heading. Anchored to the actual heading line (not a
 * prose mention of the same words elsewhere, e.g. in the "Dry run"
 * section) by requiring the `## ` markdown prefix.
 */
async function stepSection(heading: string): Promise<string> {
  const c = await content();
  const marker = `## ${heading}`;
  const start = c.indexOf(marker);
  expect(start, `heading not found: ${marker}`).toBeGreaterThanOrEqual(0);
  const rest = c.slice(start + marker.length);
  const nextHeadingOffset = rest.indexOf('\n## ');
  return nextHeadingOffset === -1 ? rest : rest.slice(0, nextHeadingOffset);
}

describe('away-mode SKILL.md — frontmatter', () => {
  it('declares name, description, invocation: explicit, and disables model invocation', async () => {
    const fm = parseFrontmatter(await content());
    expect(fm.name).toBe('away-mode');
    expect(fm.description).toBeTruthy();
    expect(fm.invocation).toBe('explicit');
    expect(fm.disableModelInvocation).toBe('true');
  });

  it('description names its triggers', async () => {
    const fm = parseFrontmatter(await content());
    const description = fm.description ?? '';
    expect(description).toMatch(/away mode/i);
    expect(description).toMatch(/modo independiente/i);
    expect(description).toMatch(/me voy a dormir/i);
    expect(description).toMatch(/\/away-mode/);
  });

  it('marks itself praxis-native, so update/uninstall recognize the shipped file as praxis-owned', async () => {
    const fm = parseFrontmatter(await content());
    expect(fm.praxisNative).toBe('true');
  });

  it('lists `check` in argument-hint, alongside the return triggers', async () => {
    const fm = parseFrontmatter(await content());
    expect(fm.argumentHint ?? '').toMatch(/\bcheck\b/);
  });
});

describe('away-mode SKILL.md — step 1 is split into 1a (read-only) and 1b (activation)', () => {
  it('has a "1a — Readiness checks (read-only)" heading and a "1b — Activation" heading', async () => {
    const c = await content();
    expect(containsClause(c, '1a — Readiness checks (read-only)')).toBe(true);
    expect(containsClause(c, '1b — Activation')).toBe(true);
  });

  it('keeps 1a read-only: tool detection, current cc-flags state, HERDR_PANE_ID, cc-status', async () => {
    const section = await stepSection('Step 1a');
    expect(section).toContain('command -v');
    expect(section).toContain('HERDR_PANE_ID');
    expect(containsClause(section, 'Herdr')).toBe(true);
    expect(section).toContain('cc-status');
    expect(
      containsClause(section, 'cc-flags [-h] target [{auto_compact,auto_resume}] [{on,off}]'),
    ).toBe(true);
    // 1a reads current state; it must not turn cc-flags on.
    expect(section).not.toMatch(/auto_compact on/);
    expect(section).not.toMatch(/auto_resume on/);
  });

  it('confines activation to 1b: cc-flags on + read-back, context guard, review consent', async () => {
    const section = await stepSection('Step 1b');
    expect(containsClause(section, 'auto_compact on')).toBe(true);
    expect(containsClause(section, 'auto_resume on')).toBe(true);
    expect(containsClause(section, 'read back')).toBe(true);
    expect(section).toContain('iris-context-guard');
    expect(section).toContain('iris-review-consent');
    expect(containsClause(section, 'always-yes')).toBe(true);
    expect(containsClause(section, 'standing order')).toBe(true);
  });

  it('documents the iris-context-guard fallback to the praxis context-budget protocol', async () => {
    const c = await content();
    expect(c).toContain('iris-context-guard');
    expect(c).toContain('~/.praxis/context-budget.md');
  });

  it('documents account-limit checks via cc-status and never auto-switching accounts', async () => {
    const c = await content();
    expect(c).toContain('cc-status');
    expect(c).toContain('cc-switch');
    expect(containsClause(c, "never switch without the user's yes")).toBe(true);
  });

  it('records the prior value of each switch in Step 1b so Step 6 can restore it exactly', async () => {
    const section = await stepSection('Step 1b');
    expect(containsClause(section, 'record its prior value in the task document and Engram')).toBe(
      true,
    );
    expect(containsClause(section, 'record the current')).toBe(true);
    expect(containsClause(section, 'record whether it is currently enabled or disabled')).toBe(
      true,
    );
    expect(containsClause(section, 'record its current mode')).toBe(true);
  });
});

describe('away-mode SKILL.md — context-budget consistency between 1b and step 4', () => {
  it('never tells the agent to rely on the context-budget poll while away', async () => {
    const c = await content();
    expect(containsClause(c, 'relies on the context-budget poll')).toBe(false);
    expect(containsClause(c, 'automatic save-and-continue')).toBe(true);
  });

  it('routes the cc-flags-missing and context-guard-missing fallbacks to Step 4, not polling', async () => {
    const section = await stepSection('Step 1b');
    expect(containsClause(section, 'Step 4 automatic save-and-continue rule')).toBe(true);
    expect(containsClause(section, 'does not run while away')).toBe(true);
  });
});

describe('away-mode SKILL.md — workflow sizing (step 2)', () => {
  it('references the workflow-policy cap of 4 concurrent code writers', async () => {
    const c = await content();
    expect(c).toContain('~/.praxis/workflow-policy.md');
    expect(containsClause(c, 'cap at 4 concurrent code writers')).toBe(true);
  });
});

describe('away-mode SKILL.md — blocker sweep (step 3)', () => {
  it('references command-handoff conventions for absolute paths and secret placeholders', async () => {
    const c = await content();
    expect(c).toContain('~/.praxis/command-handoff.md');
    expect(containsClause(c, 'absolute paths')).toBe(true);
    expect(containsClause(c, 'secret placeholders')).toBe(true);
  });

  it('caps AskUserQuestion rounds at 4 questions per round', async () => {
    const c = await content();
    expect(containsClause(c, 'max 4 questions per round')).toBe(true);
  });
});

describe('away-mode SKILL.md — overnight rules (step 4)', () => {
  it('forbids AskUserQuestion while away and defines the NEEDS-USER escalation path', async () => {
    const c = await content();
    expect(containsClause(c, 'no AskUserQuestion while away')).toBe(true);
    expect(c).toContain('NEEDS-USER');
    expect(c).toContain('iris-task');
  });

  it("keeps risky or irreversible live switches for the user's return", async () => {
    const c = await content();
    expect(containsClause(c, 'risky or irreversible')).toBe(true);
    expect(containsClause(c, 'irreversibility firewall')).toBe(true);
  });

  it('replaces the context-budget poll with an automatic save-and-continue', async () => {
    const c = await content();
    expect(containsClause(c, 'automatic save-and-continue')).toBe(true);
  });

  it('records overnight rules in Engram and the task document', async () => {
    const c = await content();
    expect(containsClause(c, 'Engram')).toBe(true);
  });
});

describe('away-mode SKILL.md — /loop proposal (step 5)', () => {
  it('proposes the exact /loop dynamic-mode command and notes it cannot self-start', async () => {
    const c = await content();
    expect(c).toContain('/loop');
    expect(containsClause(c, 'the agent cannot start /loop itself')).toBe(true);
  });
});

describe('away-mode SKILL.md — on return (step 6)', () => {
  it('declares the "back"/"volví" return trigger in the parsed frontmatter, not an unanchored body match', async () => {
    // Regression: an unanchored /back/ against the whole file trivially
    // matches unrelated prose (e.g. "background", "fall back"). The actual
    // contract is that the trigger is declared where invocation triggers
    // live: the frontmatter description and argument-hint.
    const fm = parseFrontmatter(await content());
    expect(fm.description ?? '').toMatch(/\bback\b/i);
    expect(fm.description ?? '').toMatch(/volv[íi]/i);
    expect(fm.argumentHint ?? '').toMatch(/\bback\b/i);
    expect(fm.argumentHint ?? '').toMatch(/volv[íi]/i);
  });

  it('summarizes the away-mode close-out and restores interactive rules', async () => {
    const c = await content();
    expect(containsClause(c, 'restore interactive rules')).toBe(true);
  });

  it('restores review auto-consent and the context guard to their Step 1b-recorded values by default', async () => {
    const section = await stepSection('Step 6');
    expect(containsClause(section, 'restore every switch Step 1b turned on')).toBe(true);
    expect(containsClause(section, 'restore the previous mode recorded in Step 1b')).toBe(true);
    expect(section).toContain('iris-review-consent');
    expect(section).toContain('iris-context-guard');
    // Restoring is the default; Step 6 does not ask before reverting these.
    expect(containsClause(section, 'this is the default, not something to ask about')).toBe(true);
  });

  it('asks the user only about auto_compact/auto_resume, restoring the other switches by default', async () => {
    const section = await stepSection('Step 6');
    expect(containsClause(section, 'ask only about')).toBe(true);
    expect(section).toContain('auto_compact');
    expect(section).toContain('auto_resume');
  });
});

describe('away-mode SKILL.md — dry run', () => {
  it('documents a check-only invocation via the parsed argument-hint, not a bare word match', async () => {
    const fm = parseFrontmatter(await content());
    expect(fm.argumentHint ?? '').toMatch(/\bcheck\b/);
  });

  it('states the check invocation is read-only and stops after step 1a', async () => {
    const c = await content();
    expect(containsClause(c, 'Dry run')).toBe(true);
    expect(containsClause(c, 'run ONLY step 1a')).toBe(true);
    expect(containsClause(c, 'no step 1b activation')).toBe(true);
    expect(containsClause(c, 'no `AskUserQuestion`')).toBe(true);
    expect(containsClause(c, 'no writes to Engram or')).toBe(true);
    expect(containsClause(c, 'none of steps 2-6 run')).toBe(true);
  });
});
