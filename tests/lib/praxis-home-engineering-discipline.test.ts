import { describe, it, expect } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const pkgRoot = join(import.meta.dirname, '..', '..');
const templatesRoot = join(pkgRoot, 'templates', 'praxis-home');

describe('praxis-home engineering-discipline module', () => {
  it('is imported from main.md before the balanced preset', async () => {
    const main = await readFile(join(templatesRoot, 'main.md'), 'utf8');
    expect(main).toContain('@engineering-discipline.md');
    const importIndex = main.indexOf('@engineering-discipline.md');
    const presetIndex = main.indexOf('@presets/balanced.md');
    expect(presetIndex).toBeGreaterThan(-1);
    expect(importIndex).toBeLessThan(presetIndex);
  });

  it('exists as a template file', async () => {
    const target = join(templatesRoot, 'engineering-discipline.md');
    const exists = await stat(target);
    expect(exists.isFile()).toBe(true);
  });

  it('states the four rules and the scope note', async () => {
    const content = await readFile(join(templatesRoot, 'engineering-discipline.md'), 'utf8');
    const flat = content.replace(/\s+/g, ' ');
    expect(content).toContain('# Praxis-ai — Engineering Discipline');
    expect(flat).toContain('Never silence an error');
    expect(flat).toContain('|| true');
    expect(flat).toContain('Check the key claim');
    expect(flat).toContain('double submit');
    expect(flat).toContain('what you picked, what you gave up, and why');
    expect(flat).toContain('Project facts');
  });
});
