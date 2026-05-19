import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addDenyEntries,
  removeDenyEntries,
  readSettings,
  writeSettings,
  patchSettings,
  unpatchSettings,
  type ClaudeSettings,
} from '../../src/lib/settings-patcher.js';

describe('addDenyEntries', () => {
  it('creates permissions.deny when absent', () => {
    const result = addDenyEntries({}, ['Bash(rm -rf *)']);
    expect(result.permissions?.deny).toEqual(['Bash(rm -rf *)']);
  });

  it('preserves existing keys outside permissions', () => {
    const input: ClaudeSettings = { model: 'opus', other: 'value' };
    const result = addDenyEntries(input, ['Bash(rm -rf *)']);
    expect(result.model).toBe('opus');
    expect(result.other).toBe('value');
  });

  it('preserves other permissions keys (e.g. defaultMode, allow)', () => {
    const input: ClaudeSettings = {
      permissions: { defaultMode: 'bypassPermissions', deny: ['existing'] },
    };
    const result = addDenyEntries(input, ['new']);
    expect(result.permissions?.defaultMode).toBe('bypassPermissions');
    expect(result.permissions?.deny).toEqual(['existing', 'new']);
  });

  it('dedupes existing entries (idempotent)', () => {
    const input: ClaudeSettings = { permissions: { deny: ['Bash(rm -rf *)'] } };
    const result = addDenyEntries(input, ['Bash(rm -rf *)', 'Bash(rm -fr *)']);
    expect(result.permissions?.deny).toEqual(['Bash(rm -rf *)', 'Bash(rm -fr *)']);
  });

  it('appends new entries preserving original order', () => {
    const input: ClaudeSettings = { permissions: { deny: ['a', 'b', 'c'] } };
    const result = addDenyEntries(input, ['d', 'e']);
    expect(result.permissions?.deny).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('does not mutate the input', () => {
    const input: ClaudeSettings = { permissions: { deny: ['a'] } };
    addDenyEntries(input, ['b']);
    expect(input.permissions?.deny).toEqual(['a']);
  });
});

describe('removeDenyEntries', () => {
  it('removes only the specified entries', () => {
    const input: ClaudeSettings = { permissions: { deny: ['user-rule', 'praxis-rule'] } };
    const result = removeDenyEntries(input, ['praxis-rule']);
    expect(result.permissions?.deny).toEqual(['user-rule']);
  });

  it('handles entries that are not present without error', () => {
    const input: ClaudeSettings = { permissions: { deny: ['only-this'] } };
    const result = removeDenyEntries(input, ['not-here']);
    expect(result.permissions?.deny).toEqual(['only-this']);
  });

  it('returns input as-is when permissions key is missing', () => {
    const input: ClaudeSettings = { other: 'value' };
    const result = removeDenyEntries(input, ['anything']);
    expect(result.other).toBe('value');
    expect(result.permissions).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const input: ClaudeSettings = { permissions: { deny: ['a', 'b'] } };
    removeDenyEntries(input, ['a']);
    expect(input.permissions?.deny).toEqual(['a', 'b']);
  });
});

describe('readSettings / writeSettings', () => {
  let workDir: string;
  let settingsJson: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'praxis-settings-test-'));
    settingsJson = join(workDir, 'settings.json');
  });

  it('readSettings returns empty object when file is missing', async () => {
    const result = await readSettings(settingsJson);
    expect(result).toEqual({});
  });

  it('readSettings parses an existing file', async () => {
    await writeFile(settingsJson, JSON.stringify({ model: 'opus' }), 'utf8');
    const result = await readSettings(settingsJson);
    expect(result.model).toBe('opus');
  });

  it('writeSettings creates parent directories', async () => {
    const nested = join(workDir, 'deep', 'nested', 'settings.json');
    await writeSettings(nested, { model: 'haiku' });
    const content = await readFile(nested, 'utf8');
    expect(JSON.parse(content)).toEqual({ model: 'haiku' });
  });

  it('writeSettings produces pretty-printed JSON with trailing newline', async () => {
    await writeSettings(settingsJson, { a: 1, b: 2 });
    const content = await readFile(settingsJson, 'utf8');
    expect(content.endsWith('\n')).toBe(true);
    expect(content).toContain('  "a": 1');
  });
});

describe('patchSettings / unpatchSettings', () => {
  let workDir: string;
  let settingsJson: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'praxis-settings-test-'));
    settingsJson = join(workDir, 'settings.json');
  });

  it('patchSettings creates the file with deny list when missing', async () => {
    await patchSettings(settingsJson, ['Bash(rm -rf *)']);
    const result = await readSettings(settingsJson);
    expect(result.permissions?.deny).toEqual(['Bash(rm -rf *)']);
  });

  it('patchSettings preserves user-defined keys', async () => {
    const original = {
      model: 'opus',
      permissions: { defaultMode: 'bypassPermissions', deny: ['user-rule'] },
    };
    await writeFile(settingsJson, JSON.stringify(original, null, 2) + '\n', 'utf8');
    await patchSettings(settingsJson, ['praxis-rule']);
    const result = await readSettings(settingsJson);
    expect(result.model).toBe('opus');
    expect(result.permissions?.defaultMode).toBe('bypassPermissions');
    expect(result.permissions?.deny).toEqual(['user-rule', 'praxis-rule']);
  });

  it('patchSettings is idempotent on re-run', async () => {
    await patchSettings(settingsJson, ['rule-a', 'rule-b']);
    const afterFirst = await readFile(settingsJson, 'utf8');
    await patchSettings(settingsJson, ['rule-a', 'rule-b']);
    const afterSecond = await readFile(settingsJson, 'utf8');
    expect(afterSecond).toBe(afterFirst);
  });

  it('unpatchSettings removes only praxis-added entries, preserves user rules', async () => {
    const original = { permissions: { deny: ['user-rule', 'another-user-rule'] } };
    await writeFile(settingsJson, JSON.stringify(original, null, 2) + '\n', 'utf8');
    await patchSettings(settingsJson, ['praxis-rule-1', 'praxis-rule-2']);
    await unpatchSettings(settingsJson, ['praxis-rule-1', 'praxis-rule-2']);
    const result = await readSettings(settingsJson);
    expect(result.permissions?.deny).toEqual(['user-rule', 'another-user-rule']);
  });
});
