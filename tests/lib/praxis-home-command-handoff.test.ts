import { describe, it, expect } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const pkgRoot = join(import.meta.dirname, '..', '..');
const templatesRoot = join(pkgRoot, 'templates', 'praxis-home');

describe('praxis-home command-handoff module', () => {
  it('is imported from main.md before the balanced preset', async () => {
    const main = await readFile(join(templatesRoot, 'main.md'), 'utf8');
    expect(main).toContain('@command-handoff.md');
    const importIndex = main.indexOf('@command-handoff.md');
    const presetIndex = main.indexOf('@presets/balanced.md');
    expect(presetIndex).toBeGreaterThan(-1);
    expect(importIndex).toBeLessThan(presetIndex);
  });

  it('exists as a template file', async () => {
    const target = join(templatesRoot, 'command-handoff.md');
    const exists = await stat(target);
    expect(exists.isFile()).toBe(true);
  });

  it('states the absolute-paths, placeholder, and no-print-secrets clauses', async () => {
    const content = await readFile(join(templatesRoot, 'command-handoff.md'), 'utf8');
    expect(content).toContain('absolute paths');
    expect(content).toContain('PEGA_AQUI_TU_API_KEY');
    expect(content).toContain('never print');
  });
});
