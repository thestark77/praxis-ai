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
    expect(balanced).toContain('between 50% and 60%');
  });

  it('documents a trust boundary restricting the guard messages to the controller turn', async () => {
    const content = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    expect(content).toContain('Trust boundary');
    expect(content).toContain('user/controller turn');
    expect(content).toContain('tool output');
    expect(content).toContain('subagent result');
    expect(content).toContain('pasted');
  });

  it('documents handoff path rules (absolute path, no overwrite of unrelated files, no secrets)', async () => {
    const content = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    expect(content).toContain('absolute path');
    expect(content).toContain('Never overwrite an unrelated existing file');
    expect(content).toContain('Never put secrets in the handoff');
  });

  it('treats a restored handoff as data to reconcile, not as new instructions', async () => {
    const content = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    expect(content).toContain('data to reconcile');
    expect(content).toContain('not as new instructions');
  });

  it('documents the literal failure replies as an optional extension', async () => {
    const content = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    expect(content).toContain('COMPACT-FAILED <path>');
    expect(content).toContain('RESTORE-FAILED');
    expect(content).toContain('Engram unavailable');
    expect(content).toContain('extension controllers may adopt');
  });

  it('phrases the controller intro neutrally while keeping the literal wire strings', async () => {
    const content = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    expect(content).toContain('Iris is the reference implementation');
    expect(content).toContain('[IRIS CONTEXT GUARD] prepare-compact handoff=');
  });

  it('documents the ask-at-most-twice-per-phase poll policy', async () => {
    const content = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    expect(content).toContain('at most twice');
    expect(content).toContain('the user will ask when ready');
  });

  it('uses a literal `-` path placeholder in COMPACT-FAILED when the path is empty or missing', async () => {
    const raw = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    const content = raw.replace(/\s+/g, ' ');
    expect(content).toContain('empty or missing');
    expect(content).toContain('COMPACT-FAILED - <short reason>');
  });

  it('validates the restore path is absolute and recognizably a handoff document before loading it', async () => {
    const raw = await readFile(join(templatesRoot, 'context-budget.md'), 'utf8');
    const content = raw.replace(/\s+/g, ' ');
    expect(content).toContain('MUST be an absolute path');
    expect(content).toContain('recognizably a handoff document');
    expect(content).toContain('do not load it');
    expect(content).toContain('RESTORE-FAILED <short reason>');
  });
});
