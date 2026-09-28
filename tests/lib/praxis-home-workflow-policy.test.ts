import { describe, it, expect } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const pkgRoot = join(import.meta.dirname, '..', '..');
const templatesRoot = join(pkgRoot, 'templates', 'praxis-home');

describe('praxis-home workflow-policy module', () => {
  it('is imported from main.md before the balanced preset', async () => {
    const main = await readFile(join(templatesRoot, 'main.md'), 'utf8');
    expect(main).toContain('@workflow-policy.md');
    const importIndex = main.indexOf('@workflow-policy.md');
    const presetIndex = main.indexOf('@presets/balanced.md');
    expect(presetIndex).toBeGreaterThan(-1);
    expect(importIndex).toBeLessThan(presetIndex);
  });

  it('exists as a template file', async () => {
    const target = join(templatesRoot, 'workflow-policy.md');
    const exists = await stat(target);
    expect(exists.isFile()).toBe(true);
  });

  it('states the disjoint-ownership, no-delivery, and concurrency-cap clauses', async () => {
    const content = await readFile(join(templatesRoot, 'workflow-policy.md'), 'utf8');
    expect(content).toContain('one task per worktree');
    expect(content).toContain('single owner');
    expect(content).toContain('never deliver');
    expect(content).toContain('at most 4');
  });
});
