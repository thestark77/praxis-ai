import { describe, it, expect } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const pkgRoot = join(import.meta.dirname, '..', '..');
const templatesRoot = join(pkgRoot, 'templates', 'praxis-home');

describe('praxis-home effort-policy module', () => {
  it('is imported from main.md before the balanced preset', async () => {
    const main = await readFile(join(templatesRoot, 'main.md'), 'utf8');
    expect(main).toContain('@effort-policy.md');
    const importIndex = main.indexOf('@effort-policy.md');
    const presetIndex = main.indexOf('@presets/balanced.md');
    expect(presetIndex).toBeGreaterThan(-1);
    expect(importIndex).toBeLessThan(presetIndex);
  });

  it('exists as a template file', async () => {
    const target = join(templatesRoot, 'effort-policy.md');
    const exists = await stat(target);
    expect(exists.isFile()).toBe(true);
  });

  it('states the medium-default, escalation, and overthinking-risk clauses', async () => {
    const content = await readFile(join(templatesRoot, 'effort-policy.md'), 'utf8');
    // Assert rule bodies, not only headings or stray words.
    const flat = content.replace(/\s+/g, ' ');
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
