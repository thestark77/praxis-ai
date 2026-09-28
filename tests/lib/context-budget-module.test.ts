import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const pkgRoot = join(import.meta.dirname, '..', '..');
const templatesRoot = join(pkgRoot, 'templates', 'praxis-home');

describe('praxis-home context-budget module', () => {
  it('is imported from main.md, placed near the end before presets/balanced.md', async () => {
    const main = await readFile(join(templatesRoot, 'main.md'), 'utf8');
    expect(main).toContain('@context-budget.md');
    const budgetIdx = main.indexOf('@context-budget.md');
    const balancedIdx = main.indexOf('@presets/balanced.md');
    expect(balancedIdx).toBeGreaterThan(-1);
    expect(budgetIdx).toBeGreaterThan(-1);
    expect(budgetIdx).toBeLessThan(balancedIdx);
  });

  it('exists with the expected title', async () => {
    const content = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    expect(content).toContain('# Praxis-ai — Context Budget');
  });

  it('documents the 50-60% poll window and the native question tool', async () => {
    const content = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    expect(content).toContain('50%');
    expect(content).toContain('60%');
    expect(content).toContain('AskUserQuestion');
  });

  it('documents the literal Iris context-guard protocol strings', async () => {
    const content = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    expect(content).toContain('[IRIS CONTEXT GUARD] prepare-compact handoff=');
    expect(content).toContain('COMPACT-READY');
    expect(content).toContain('[IRIS CONTEXT GUARD] restore handoff=');
    expect(content).toContain('CONTEXT-RESTORED');
  });

  it('balanced.md points at the poll window instead of a flat 75% warning', async () => {
    const balanced = await readFile(join(templatesRoot, 'presets', 'balanced.md'), 'utf8');
    expect(balanced).not.toContain('Warn at 75%');
    expect(balanced).toContain('context-budget.md');
    expect(balanced).toContain('50');
    expect(balanced).toContain('60');
  });
});
