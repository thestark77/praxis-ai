import { describe, it, expect } from 'vitest';
import {
  translateDenyEntry,
  translateDenyEntries,
  mergePraxisPermissions,
  removePraxisPermissions,
  countActivePraxisRules,
  type OpenCodePermissions,
} from '../../../src/lib/opencode/permissions.js';
import { FIREWALL_DEFAULTS } from '../../../src/data/firewall-defaults.js';

describe('translateDenyEntry', () => {
  it('maps a Bash rule to a single bash pattern', () => {
    expect(translateDenyEntry('Bash(rm -rf *)')).toEqual([{ tool: 'bash', pattern: 'rm -rf *' }]);
  });

  it('maps a Read rule to both the bare and the recursive path glob', () => {
    expect(translateDenyEntry('Read(*.pem)')).toEqual([
      { tool: 'read', pattern: '*.pem' },
      { tool: 'read', pattern: '**/*.pem' },
    ]);
  });

  it('does not double-anchor a pattern that is already recursive', () => {
    expect(translateDenyEntry('Read(**/secrets/**)')).toEqual([
      { tool: 'read', pattern: '**/secrets/**' },
    ]);
  });

  it('maps Write to the edit permission', () => {
    expect(translateDenyEntry('Write(.env)')).toEqual([
      { tool: 'edit', pattern: '.env' },
      { tool: 'edit', pattern: '**/.env' },
    ]);
  });

  it('ignores tools OpenCode has no permission surface for', () => {
    expect(translateDenyEntry('WebFetch(domain:example.com)')).toEqual([]);
    expect(translateDenyEntry('not a rule')).toEqual([]);
  });
});

describe('translateDenyEntries', () => {
  it('translates the whole shipped firewall without dropping bash rules', () => {
    const rules = translateDenyEntries(FIREWALL_DEFAULTS);
    const bashRules = FIREWALL_DEFAULTS.filter((e) => e.startsWith('Bash('));
    expect(rules.filter((r) => r.tool === 'bash')).toHaveLength(bashRules.length);
    expect(rules.some((r) => r.tool === 'bash' && r.pattern === 'git push --force*')).toBe(true);
    expect(rules.some((r) => r.tool === 'read' && r.pattern === '**/.aws/credentials')).toBe(true);
  });

  it('de-duplicates patterns produced by different entries', () => {
    const rules = translateDenyEntries(['Read(*.pem)', 'Read(*.pem)', 'Read(**/*.pem)']);
    expect(rules).toHaveLength(2);
  });
});

describe('mergePraxisPermissions', () => {
  it('adds praxis denies while preserving foreign entries', () => {
    const existing: OpenCodePermissions = {
      bash: { '*': 'allow', 'git commit *': 'ask' },
      read: { '*': 'allow', '**/.env': 'deny' },
    };
    const merged = mergePraxisPermissions(existing, [
      { tool: 'bash', pattern: 'rm -rf *' },
      { tool: 'read', pattern: '**/*.pem' },
    ]);
    expect(merged.permissions.bash).toEqual({
      '*': 'allow',
      'git commit *': 'ask',
      'rm -rf *': 'deny',
    });
    expect(merged.permissions.read).toEqual({
      '*': 'allow',
      '**/.env': 'deny',
      '**/*.pem': 'deny',
    });
    expect(merged.added).toHaveLength(2);
    expect(merged.upgraded).toHaveLength(0);
  });

  it('raises a weaker existing action to deny and reports it', () => {
    const merged = mergePraxisPermissions({ bash: { 'git push --force *': 'ask' } }, [
      { tool: 'bash', pattern: 'git push --force *' },
    ]);
    expect((merged.permissions.bash as Record<string, string>)['git push --force *']).toBe('deny');
    expect(merged.upgraded).toEqual([
      { tool: 'bash', pattern: 'git push --force *', previous: 'ask' },
    ]);
    expect(merged.added).toHaveLength(0);
  });

  it('leaves an already-denied pattern untouched', () => {
    const merged = mergePraxisPermissions({ bash: { 'rm -rf *': 'deny' } }, [
      { tool: 'bash', pattern: 'rm -rf *' },
    ]);
    expect(merged.unchanged).toHaveLength(1);
    expect(merged.added).toHaveLength(0);
    expect(merged.upgraded).toHaveLength(0);
  });

  it('widens a scalar permission into a map instead of dropping it', () => {
    const merged = mergePraxisPermissions({ bash: 'allow' }, [
      { tool: 'bash', pattern: 'rm -rf *' },
    ]);
    expect(merged.permissions.bash).toEqual({ '*': 'allow', 'rm -rf *': 'deny' });
  });

  it('does not mutate the input permissions object', () => {
    const existing: OpenCodePermissions = { bash: { '*': 'allow' } };
    mergePraxisPermissions(existing, [{ tool: 'bash', pattern: 'rm -rf *' }]);
    expect(existing).toEqual({ bash: { '*': 'allow' } });
  });
});

describe('removePraxisPermissions', () => {
  it('removes only praxis denies and keeps everything else', () => {
    const merged = mergePraxisPermissions({ bash: { '*': 'allow', 'git commit *': 'ask' } }, [
      { tool: 'bash', pattern: 'rm -rf *' },
    ]);
    const stripped = removePraxisPermissions(merged.permissions, [
      { tool: 'bash', pattern: 'rm -rf *' },
    ]);
    expect(stripped.permissions.bash).toEqual({ '*': 'allow', 'git commit *': 'ask' });
    expect(stripped.removed).toHaveLength(1);
  });

  it('keeps a rule the user deliberately relaxed to ask', () => {
    const stripped = removePraxisPermissions({ bash: { 'rm -rf *': 'ask' } }, [
      { tool: 'bash', pattern: 'rm -rf *' },
    ]);
    expect(stripped.permissions.bash).toEqual({ 'rm -rf *': 'ask' });
    expect(stripped.removed).toHaveLength(0);
  });

  it('drops a permission map that praxis emptied', () => {
    const stripped = removePraxisPermissions({ read: { '**/*.pem': 'deny' } }, [
      { tool: 'read', pattern: '**/*.pem' },
    ]);
    expect(stripped.permissions.read).toBeUndefined();
  });
});

describe('countActivePraxisRules', () => {
  it('counts only patterns currently enforced as deny', () => {
    const rules = [
      { tool: 'bash', pattern: 'rm -rf *' },
      { tool: 'bash', pattern: 'git push --force*' },
    ] as const;
    expect(
      countActivePraxisRules({ bash: { 'rm -rf *': 'deny', 'git push --force*': 'ask' } }, [
        ...rules,
      ]),
    ).toBe(1);
    expect(countActivePraxisRules(undefined, [...rules])).toBe(0);
  });
});
