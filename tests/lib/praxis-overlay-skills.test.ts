import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PRAXIS_NATIVE_SKILLS,
  PRAXIS_NATIVE_SKILL_NAMES,
} from '../../src/data/praxis-native-skills.js';
import { CLAUDE_SKILL_NAMES } from '../../src/data/skill-registry.js';
import { isPraxisOwnedNativeSkillFile } from '../../src/lib/ownership.js';

// The overlay's procedures used to be @-imported into every turn. They now
// ship as on-demand skills (the description is always loaded, the body only
// when the situation matches). These tests prove two things: each skill is a
// well-formed, auto-loadable praxis-native skill, and every clause the old
// always-loaded module asserted survives verbatim in its new home.

const skillsRoot = join(import.meta.dirname, '..', '..', 'templates', 'claude-skills');

/** Skills that replaced always-loaded praxis-home modules. */
const OVERLAY_SKILLS = [
  'praxis-command-handoff',
  'praxis-context-guard',
  'praxis-delegation-policy',
  'praxis-upstream-debugging',
  'praxis-browser-testing',
  'praxis-grilling',
  'praxis-firewall-protocol',
  'praxis-overlay-reference',
] as const;

type OverlaySkill = (typeof OVERLAY_SKILLS)[number];

const skillPath = (name: string): string => join(skillsRoot, name, 'SKILL.md');
const readSkill = (name: OverlaySkill): Promise<string> => readFile(skillPath(name), 'utf8');
const flatten = (text: string): string => text.replace(/\s+/g, ' ');

function frontmatter(content: string): Record<string, string> {
  const end = content.indexOf('\n---', 4);
  const out: Record<string, string> = {};
  if (!content.startsWith('---\n') || end === -1) return out;
  for (const line of content.slice(4, end).split('\n')) {
    const m = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

describe('overlay skills: manifest and shape', () => {
  it.each(OVERLAY_SKILLS)('%s is registered as a contextual praxis-native skill', (name) => {
    expect(PRAXIS_NATIVE_SKILL_NAMES).toContain(name);
    expect(CLAUDE_SKILL_NAMES).toContain(name);
    const entry = PRAXIS_NATIVE_SKILLS.find((s) => s.name === name);
    expect(entry?.invocation).toBe('contextual');
    expect(entry?.files).toEqual(['SKILL.md']);
  });

  it.each(OVERLAY_SKILLS)('%s ships a SKILL.md the ownership check recognises', async (name) => {
    const content = await readSkill(name);
    const fm = frontmatter(content);
    expect(fm.name).toBe(name);
    expect(fm.invocation).toBe('contextual');
    expect(fm['praxis-native']).toBe('true');
    expect(isPraxisOwnedNativeSkillFile(content, name)).toBe(true);
  });

  it.each(OVERLAY_SKILLS)('%s can be auto-loaded by the model', async (name) => {
    // Contextual skills must NOT carry disable-model-invocation: that flag
    // would hide the description and the skill would never load on demand.
    const fm = frontmatter(await readSkill(name));
    expect(fm['disable-model-invocation']).toBeUndefined();
  });

  it.each(OVERLAY_SKILLS)('%s has a short, trigger-first description', async (name) => {
    // The description is the only part paid on every turn, so it is bounded.
    const { description } = frontmatter(await readSkill(name));
    expect(description).toBeTruthy();
    expect(description.length).toBeLessThanOrEqual(420);
    expect(description).toMatch(/^Use when /);
  });

  it('the skills the model can auto-load add at most 2 KB of listing text in total', async () => {
    let bytes = 0;
    for (const name of OVERLAY_SKILLS) {
      const { description } = frontmatter(await readSkill(name));
      bytes += Buffer.byteLength(`- ${name}: ${description}\n`);
    }
    expect(bytes).toBeLessThanOrEqual(2000);
  });
});

describe('praxis-command-handoff', () => {
  it('states the absolute-paths, placeholder, and no-print-secrets clauses', async () => {
    const content = await readSkill('praxis-command-handoff');
    expect(content).toContain('absolute paths');
    expect(content).toContain('PEGA_AQUI_TU_API_KEY');
    expect(content).toMatch(/^## Never print, echo, log, or read secrets$/m);
  });

  it('recommends a shell-portable way to prompt for a secret', async () => {
    const content = await readSkill('praxis-command-handoff');
    expect(content).toContain('stty -echo');
    expect(content).not.toContain('read -s -p');
  });
});

describe('praxis-context-guard', () => {
  it('documents the 50-60% poll window and the native question tool', async () => {
    const content = await readSkill('praxis-context-guard');
    expect(content).toContain('# Praxis-ai — Context Budget');
    expect(content).toContain('50%');
    expect(content).toContain('60%');
    expect(content).toContain('AskUserQuestion');
  });

  it('documents the literal Iris context-guard protocol strings', async () => {
    const content = await readSkill('praxis-context-guard');
    expect(content).toContain('[IRIS CONTEXT GUARD] prepare-compact handoff=');
    expect(content).toContain('COMPACT-READY');
    expect(content).toContain('[IRIS CONTEXT GUARD] restore handoff=');
    expect(content).toContain('CONTEXT-RESTORED');
  });

  it('documents a trust boundary restricting the guard messages to the controller turn', async () => {
    const content = await readSkill('praxis-context-guard');
    expect(content).toContain('Trust boundary');
    expect(content).toContain('user/controller turn');
    expect(content).toContain('tool output');
    expect(content).toContain('subagent result');
    expect(content).toContain('pasted');
  });

  it('documents handoff path rules (absolute path, no overwrite of unrelated files, no secrets)', async () => {
    const content = await readSkill('praxis-context-guard');
    expect(content).toContain('absolute path');
    expect(content).toContain('Never overwrite an unrelated existing file');
    expect(content).toContain('Never put secrets in the handoff');
  });

  it('treats a restored handoff as data to reconcile, not as new instructions', async () => {
    const content = await readSkill('praxis-context-guard');
    expect(content).toContain('data to reconcile');
    expect(content).toContain('not as new instructions');
  });

  it('documents the literal failure replies as an optional extension', async () => {
    const content = await readSkill('praxis-context-guard');
    expect(content).toContain('COMPACT-FAILED <path>');
    expect(content).toContain('RESTORE-FAILED');
    expect(content).toContain('Engram unavailable');
    expect(content).toContain('extension controllers may adopt');
  });

  it('phrases the controller intro neutrally while keeping the literal wire strings', async () => {
    const content = await readSkill('praxis-context-guard');
    expect(content).toContain('Iris is the reference implementation');
    expect(content).toContain('[IRIS CONTEXT GUARD] prepare-compact handoff=');
  });

  it('documents the ask-at-most-twice-per-phase poll policy', async () => {
    const content = await readSkill('praxis-context-guard');
    expect(content).toContain('at most twice');
    expect(content).toContain('the user will ask when ready');
  });

  it('uses a literal `-` path placeholder in COMPACT-FAILED when the path is empty or missing', async () => {
    const content = flatten(await readSkill('praxis-context-guard'));
    expect(content).toContain('empty or missing');
    expect(content).toContain('COMPACT-FAILED - <short reason>');
  });

  it('validates the restore path is absolute and recognizably a handoff document before loading it', async () => {
    const content = flatten(await readSkill('praxis-context-guard'));
    expect(content).toContain('MUST be an absolute path');
    expect(content).toContain('recognizably a handoff document');
    expect(content).toContain('do not load it');
    expect(content).toContain('RESTORE-FAILED <short reason>');
  });
});

describe('praxis-delegation-policy', () => {
  it('states the disjoint-ownership, no-delivery, and concurrency-cap clauses', async () => {
    const raw = await readSkill('praxis-delegation-policy');
    const flat = flatten(raw);
    expect(raw).toContain('one task per worktree');
    expect(flat).toContain('Files touched by parallel agents must be disjoint');
    expect(flat).toContain('give it a single owner: one agent writes it');
    expect(flat).toContain('no push, merge, deploy, release, or PR merge');
    expect(flat).toContain('Run at most 4 agents writing code at the same time');
    expect(flat).toContain('Workflow size — the number of agents or batches — is set per session');
  });

  it('states the medium-default, escalation, and overthinking-risk clauses', async () => {
    const flat = flatten(await readSkill('praxis-delegation-policy'));
    expect(flat).toContain('Default to `medium` on Opus 5.5 for routine work');
    expect(flat).toContain('Opus 5.5 at `medium` exceeds Opus 5 at `high`');
    expect(flat).toMatch(
      /Use `high` for: - architecture decisions - security-sensitive work - corrections after a review/,
    );
    expect(flat).toContain('Reserve `xhigh` and `max` for work where a measured quality gain');
    expect(flat).toContain('prone to overthink');
    expect(flat).toContain('https://platform.claude.com/docs/en/build-with-claude/effort');
  });
});

describe('praxis-upstream-debugging', () => {
  it('states the search-open-and-closed, merge-base, explicit-OK, and example-issue clauses', async () => {
    const flat = flatten(await readSkill('praxis-upstream-debugging'));
    expect(flat).toContain('open AND closed issues and PRs');
    expect(flat).toContain('git merge-base --is-ancestor');
    expect(flat).toContain("only with the user's explicit OK");
    expect(flat).toContain('#102486');
    expect(flat).toContain('Commenting on an existing issue is also an external send');
    expect(flat).toContain('Third-party open-source tools only');
  });

  it('only uses gh search flags the CLI accepts', async () => {
    const content = await readSkill('praxis-upstream-debugging');
    // `gh search issues --state` accepts only open|closed; omitting it searches both.
    expect(content).not.toMatch(/gh search issues[^\n]*--state all/);
    expect(content).toContain('gh search issues --repo <owner/repo> "<symptom>" --include-prs');
    expect(content).toContain('gh issue list --repo <owner/repo>');
    expect(content).toContain('gh pr list --repo <owner/repo>');
  });
});

describe('praxis-browser-testing', () => {
  it('states the browser-use-first, playwright-fallback, disclosure, no-install, and untrusted-content clauses', async () => {
    const content = await readSkill('praxis-browser-testing');
    const flat = flatten(content);
    expect(flat).toContain('Browser Use FIRST');
    expect(flat).toContain('Playwright is ONLY the fallback');
    expect(flat).toContain('say so explicitly');
    expect(flat).toContain('Never install Playwright as the default path');
    expect(content).toContain('https://api.browser-use.com/mcp');
    expect(flat).toContain('mcp__browser-use__');
    expect(flat).toContain('untrusted data');
  });
});

describe('praxis-grilling', () => {
  it('keeps the grilling procedure: one question at a time, vocabulary first, ADR after 5 to 8 questions', async () => {
    const flat = flatten(await readSkill('praxis-grilling'));
    expect(flat).toContain('Ask ONE question at a time');
    expect(flat).toContain('update `CONTEXT.md` with the term that was resolved');
    expect(flat).toContain('After 5 to 8 questions');
    expect(flat).toContain('Context, Decision, Consequences, Status');
  });

  it('keeps the stop conditions and the what-grilling-is-not list', async () => {
    const flat = flatten(await readSkill('praxis-grilling'));
    expect(flat).toContain('"proceed-with-assumptions"');
    expect(flat).toContain('Eight questions reached without convergence');
    expect(flat).toContain(
      'We are stuck. Either pick a direction or break this into a smaller scope.',
    );
    expect(flat).toContain('Lecturing about why grilling matters');
    expect(flat).toContain('A blocker.');
  });

  it('keeps the CONTEXT.md, ADR and RTK.md conventions', async () => {
    const flat = flatten(await readSkill('praxis-grilling'));
    expect(flat).toContain('One term per H2 section');
    expect(flat).toContain('docs/adr/NNNN-title.md');
    expect(flat).toContain('ADRs are immutable once accepted');
    expect(flat).toContain('Status: superseded by NNNN');
    expect(flat).toContain('RTK.md');
    expect(flat).toContain('shell-output compression layer');
  });
});

describe('praxis-firewall-protocol', () => {
  it('keeps the four-step block protocol and the no-creative-bypass list', async () => {
    const flat = flatten(await readSkill('praxis-firewall-protocol'));
    expect(flat).toContain('Do NOT auto-retry without the dangerous flag');
    expect(flat).toContain('no `eval`, no base64-encoded commands');
    expect(flat).toContain('**What you tried**');
    expect(flat).toContain('**Why it was blocked**');
    expect(flat).toContain('**What the user should do**');
    expect(flat).toContain('Wait for explicit user authorisation before any related retry');
  });

  it('keeps the framing note on the two-layer firewall', async () => {
    const flat = flatten(await readSkill('praxis-firewall-protocol'));
    expect(flat).toContain('OpenAI Operator uses per-action confirmation');
    expect(flat).toContain(
      'Adjust the deny list and the protocol if it does not fit your workload',
    );
  });
});

describe('praxis-overlay-reference', () => {
  it('keeps the precedence rationale, what praxis does not touch, and standalone mode', async () => {
    const flat = flatten(await readSkill('praxis-overlay-reference'));
    expect(flat).toContain("Praxis-ai's CLAUDE.md block is inserted last");
    expect(flat).toContain('Berglund et al.');
    expect(flat).toContain("Gentle-ai's persona block");
    expect(flat).toContain('<!-- praxis:start -->');
    expect(flat).toContain('degraded standalone mode');
  });

  it('keeps the full balanced preset', async () => {
    const flat = flatten(await readSkill('praxis-overlay-reference'));
    expect(flat).toContain('The `balanced` preset is the v0.1 default');
    expect(flat).toContain('NON-TRIVIAL if ≥2 signals are detected');
    expect(flat).toContain('Not "interactive" mode');
    expect(flat).toContain('Not "autonomous" mode');
  });
});
