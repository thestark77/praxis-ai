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
});

describe('away-mode SKILL.md — unattended-readiness checks (step 1)', () => {
  it('treats every readiness tool as optional, detected via command -v', async () => {
    const c = await content();
    expect(c).toContain('command -v');
  });

  it('names Herdr and HERDR_PANE_ID as the unattended-session prerequisite', async () => {
    const c = await content();
    expect(c).toContain('HERDR_PANE_ID');
    expect(containsClause(c, 'Herdr')).toBe(true);
  });

  it('documents cc-flags for auto_compact and auto_resume, read then set then verify', async () => {
    const c = await content();
    expect(c).toContain('cc-flags');
    expect(c).toContain('auto_compact');
    expect(c).toContain('auto_resume');
    expect(containsClause(c, 'cc-flags [-h] target [{auto_compact,auto_resume}] [{on,off}]')).toBe(
      true,
    );
  });

  it('documents the iris-context-guard fallback to the praxis context-budget protocol', async () => {
    const c = await content();
    expect(c).toContain('iris-context-guard');
    expect(c).toContain('~/.praxis/context-budget.md');
  });

  it('documents iris-review-consent always-yes and the standing-order confirmation', async () => {
    const c = await content();
    expect(c).toContain('iris-review-consent');
    expect(containsClause(c, 'always-yes')).toBe(true);
  });

  it('documents account-limit checks via cc-status and never auto-switching accounts', async () => {
    const c = await content();
    expect(c).toContain('cc-status');
    expect(c).toContain('cc-switch');
    expect(containsClause(c, "never switch without the user's yes")).toBe(true);
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
  it('handles the "back"/"volví" return trigger with a summary and restored interactive rules', async () => {
    const c = await content();
    expect(c).toMatch(/back/);
    expect(c).toMatch(/volv[íi]/i);
    expect(containsClause(c, 'restore interactive rules')).toBe(true);
  });
});

describe('away-mode SKILL.md — dry run', () => {
  it('documents a check-only invocation that changes nothing', async () => {
    const c = await content();
    expect(containsClause(c, 'Dry run')).toBe(true);
    expect(c).toMatch(/\bcheck\b/);
  });
});
