import { describe, it, expect } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const pkgRoot = join(import.meta.dirname, '..', '..');
const templatesRoot = join(pkgRoot, 'templates', 'praxis-home');

describe('praxis-home upstream-first-debugging module', () => {
  it('is imported from main.md before the balanced preset', async () => {
    const main = await readFile(join(templatesRoot, 'main.md'), 'utf8');
    expect(main).toContain('@upstream-first-debugging.md');
    const importIndex = main.indexOf('@upstream-first-debugging.md');
    const presetIndex = main.indexOf('@presets/balanced.md');
    expect(presetIndex).toBeGreaterThan(-1);
    expect(importIndex).toBeLessThan(presetIndex);
  });

  it('exists as a template file', async () => {
    const target = join(templatesRoot, 'upstream-first-debugging.md');
    const exists = await stat(target);
    expect(exists.isFile()).toBe(true);
  });

  it('states the search-open-and-closed, merge-base, explicit-OK, and example-issue clauses', async () => {
    const content = await readFile(join(templatesRoot, 'upstream-first-debugging.md'), 'utf8');
    // Assert rule bodies, not only section headings.
    const flat = content.replace(/\s+/g, ' ');
    expect(flat).toContain('open AND closed issues and PRs');
    expect(flat).toContain('git merge-base --is-ancestor');
    expect(flat).toContain("only with the user's explicit OK");
    expect(flat).toContain('#102486');
    expect(flat).toContain('Commenting on an existing issue is also an external send');
    expect(flat).toContain('Third-party open-source tools only');
  });

  it('only uses gh search flags the CLI accepts', async () => {
    const content = await readFile(join(templatesRoot, 'upstream-first-debugging.md'), 'utf8');
    // `gh search issues --state` accepts only open|closed; omitting it searches both.
    expect(content).not.toMatch(/gh search issues[^\n]*--state all/);
    expect(content).toContain('gh search issues --repo <owner/repo> "<symptom>" --include-prs');
  });
});
