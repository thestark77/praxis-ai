import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readOwnership,
  recordOwnership,
  clearOwnership,
  claudeEntriesToRemove,
  opencodeRulesToRemove,
  ownershipPath,
  emptyLedger,
} from '../../src/lib/ownership.js';

async function praxisDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'praxis-ownership-'));
}

describe('the ownership ledger', () => {
  it('reports no ledger before anything is recorded', async () => {
    expect(await readOwnership(await praxisDir())).toBeNull();
  });

  it('round-trips what was recorded', async () => {
    const dir = await praxisDir();
    await recordOwnership(dir, {
      claudeCode: ['Bash(rm -rf *)'],
      opencode: [{ tool: 'read', pattern: '**/.env' }],
    });
    const ledger = await readOwnership(dir);
    expect(ledger?.claudeCode).toEqual(['Bash(rm -rf *)']);
    expect(ledger?.opencode).toEqual([{ tool: 'read', pattern: '**/.env' }]);
  });

  it('accumulates across reinstalls instead of replacing', async () => {
    const dir = await praxisDir();
    await recordOwnership(dir, { claudeCode: ['Bash(rm -rf *)'] });
    await recordOwnership(dir, { claudeCode: ['Bash(git filter-branch*)'] });
    const ledger = await readOwnership(dir);
    expect(ledger?.claudeCode).toEqual(['Bash(rm -rf *)', 'Bash(git filter-branch*)']);
  });

  it('does not record the same entry twice', async () => {
    const dir = await praxisDir();
    await recordOwnership(dir, { claudeCode: ['Bash(rm -rf *)'] });
    await recordOwnership(dir, { claudeCode: ['Bash(rm -rf *)'] });
    expect((await readOwnership(dir))?.claudeCode).toHaveLength(1);
  });

  it('treats a corrupt ledger as absent rather than throwing', async () => {
    const dir = await praxisDir();
    await writeFile(ownershipPath(dir), 'not json at all', 'utf8');
    expect(await readOwnership(dir)).toBeNull();
  });

  it('treats an unknown schema version as absent', async () => {
    const dir = await praxisDir();
    await writeFile(ownershipPath(dir), JSON.stringify({ version: 99 }), 'utf8');
    expect(await readOwnership(dir)).toBeNull();
  });

  it('clears without complaint when there is nothing to clear', async () => {
    await expect(clearOwnership(await praxisDir())).resolves.toBeUndefined();
  });

  it('writes valid JSON a human can read', async () => {
    const dir = await praxisDir();
    await recordOwnership(dir, { claudeCode: ['Read(.env)'] });
    const raw = await readFile(ownershipPath(dir), 'utf8');
    expect(JSON.parse(raw).version).toBe(1);
    expect(raw.endsWith('\n')).toBe(true);
  });
});

describe('deciding what uninstall may remove', () => {
  const firewall = ['Read(.env)', 'Bash(rm -rf *)', 'Bash(git filter-branch*)'];

  it('removes only the entries praxis added', () => {
    const ledger = { ...emptyLedger(), claudeCode: ['Bash(rm -rf *)'] };
    expect(claudeEntriesToRemove(ledger, firewall)).toEqual(['Bash(rm -rf *)']);
  });

  it('leaves a rule somebody else had already written', () => {
    const ledger = { ...emptyLedger(), claudeCode: ['Bash(rm -rf *)'] };
    expect(claudeEntriesToRemove(ledger, firewall)).not.toContain('Read(.env)');
  });

  it('ignores an owned entry that later praxis versions dropped', () => {
    const ledger = { ...emptyLedger(), claudeCode: ['Bash(retired-rule*)'] };
    expect(claudeEntriesToRemove(ledger, firewall)).toEqual([]);
  });

  it('falls back to the whole list when authorship is unknown', () => {
    expect(claudeEntriesToRemove(null, firewall)).toEqual(firewall);
  });

  it('applies the same rule to OpenCode', () => {
    const rules = [
      { tool: 'read', pattern: '**/.env' },
      { tool: 'bash', pattern: 'rm -rf *' },
    ];
    const ledger = { ...emptyLedger(), opencode: [{ tool: 'bash', pattern: 'rm -rf *' }] };
    expect(opencodeRulesToRemove(ledger, rules)).toEqual([{ tool: 'bash', pattern: 'rm -rf *' }]);
    expect(opencodeRulesToRemove(null, rules)).toEqual(rules);
  });
});
