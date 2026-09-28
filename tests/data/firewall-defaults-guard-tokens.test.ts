import { describe, it, expect } from 'vitest';
import { FIREWALL_DEFAULTS } from '../../src/data/firewall-defaults.js';
import { translateDenyEntries } from '../../src/lib/opencode/permissions.js';
import { inspectBashCommand } from '../../src/lib/ast/inspect.js';

// This file's own basename must never end in the literal `.token`
// extension while containing "bypass": that shape is exactly what
// `read-bypass-token` and the L1 `Read(**/*bypass*.token)` glob are built
// to catch, and a contributor touching this suite would otherwise be
// blocked from reading, editing, or even `cat`-ing the file that tests the
// rule. See the self-block guard test below.
describe('FIREWALL_DEFAULTS — bypass-token secrets entries', () => {
  it('denies reading a literal `bypass.token` file at any depth', () => {
    expect(FIREWALL_DEFAULTS).toContain('Read(**/bypass.token)');
  });

  it('denies reading any `.token` file whose basename also contains "bypass"', () => {
    expect(FIREWALL_DEFAULTS).toContain('Read(**/*bypass*.token)');
  });

  it('translates cleanly into OpenCode read-permission rules', () => {
    const rules = translateDenyEntries(FIREWALL_DEFAULTS);
    expect(rules.some((r) => r.tool === 'read' && r.pattern === '**/bypass.token')).toBe(true);
    expect(rules.some((r) => r.tool === 'read' && r.pattern === '**/*bypass*.token')).toBe(true);
  });
});

describe('guard-evasion rules do not self-block the repository', () => {
  it('allows reading this very test file (basename has no bypass+token clash)', () => {
    expect(
      inspectBashCommand('cat tests/data/firewall-defaults-guard-tokens.test.ts').decision,
    ).toBe('allow');
  });

  it('allows reading the AST rules source that defines read-bypass-token', () => {
    expect(inspectBashCommand('cat src/lib/ast/rules.ts').decision).toBe('allow');
  });
});
