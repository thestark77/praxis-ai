import { describe, it, expect } from 'vitest';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { POCOCK_SKILLS, POCOCK_LICENSE, POCOCK_REPO_COMMIT } from '../../src/data/pocock-skills.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILLS_ROOT = join(__dirname, '..', '..', 'templates', 'claude-skills');

interface Frontmatter {
  name?: string;
  description?: string;
  invocation?: string;
  triggers?: unknown;
}

function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith('---\n')) {
    return {};
  }
  const end = content.indexOf('\n---', 4);
  if (end === -1) return {};
  const block = content.slice(4, end);
  const out: Frontmatter = {};
  const lines = block.split('\n');
  // Capture top-level scalar fields. Multi-line / nested blocks (triggers)
  // are only checked for presence.
  for (const line of lines) {
    const m = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2];
    if (key === 'name') out.name = val.trim();
    else if (key === 'description') out.description = val.trim();
    else if (key === 'invocation') out.invocation = val.trim();
    else if (key === 'triggers') out.triggers = true;
  }
  return out;
}

describe('templates/claude-skills — directory shape', () => {
  it('ships exactly the six expected skill directories', async () => {
    const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(dirs).toEqual(
      ['caveman', 'diagnose', 'grill-with-docs', 'handoff', 'prototype', 'zoom-out'].sort(),
    );
  });

  it('every skill directory contains SKILL.md and NOTICE.md', async () => {
    for (const skill of POCOCK_SKILLS) {
      const dir = join(SKILLS_ROOT, skill.name);
      const skillMd = await stat(join(dir, 'SKILL.md'));
      const noticeMd = await stat(join(dir, 'NOTICE.md'));
      expect(skillMd.isFile()).toBe(true);
      expect(noticeMd.isFile()).toBe(true);
    }
  });
});

describe('templates/claude-skills — SKILL.md frontmatter', () => {
  it('every SKILL.md declares name + description + invocation', async () => {
    for (const skill of POCOCK_SKILLS) {
      const content = await readFile(join(SKILLS_ROOT, skill.name, 'SKILL.md'), 'utf8');
      const fm = parseFrontmatter(content);
      expect(fm.name, `${skill.name}: name`).toBe(skill.name);
      expect(fm.description, `${skill.name}: description`).toBeTruthy();
      expect(fm.invocation, `${skill.name}: invocation`).toBe(skill.invocation);
    }
  });

  it('reflex skills declare a triggers block', async () => {
    for (const skill of POCOCK_SKILLS) {
      if (skill.invocation !== 'reflex') continue;
      const content = await readFile(join(SKILLS_ROOT, skill.name, 'SKILL.md'), 'utf8');
      const fm = parseFrontmatter(content);
      expect(fm.triggers, `${skill.name}: triggers required for reflex`).toBeTruthy();
    }
  });
});

describe('templates/claude-skills — NOTICE.md attribution', () => {
  it('every NOTICE.md records the MIT license + the manifest SHAs', async () => {
    for (const skill of POCOCK_SKILLS) {
      const content = await readFile(join(SKILLS_ROOT, skill.name, 'NOTICE.md'), 'utf8');
      expect(content, `${skill.name}: MIT label`).toContain(POCOCK_LICENSE);
      expect(content, `${skill.name}: upstream URL`).toContain('mattpocock/skills');
      expect(content, `${skill.name}: repo commit`).toContain(POCOCK_REPO_COMMIT);
      for (const file of skill.files) {
        expect(content, `${skill.name}: blob SHA for ${file.upstreamPath}`).toContain(file.blobSha);
      }
    }
  });

  it('every NOTICE.md mentions the mechanism-pure rewrite policy and praxis sync-pocock', async () => {
    for (const skill of POCOCK_SKILLS) {
      const content = await readFile(join(SKILLS_ROOT, skill.name, 'NOTICE.md'), 'utf8');
      expect(content, `${skill.name}: mechanism mention`).toMatch(/mechanism/i);
      expect(content, `${skill.name}: sync-pocock refresh hook`).toContain('praxis sync-pocock');
    }
  });
});
