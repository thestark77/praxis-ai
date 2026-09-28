import { describe, it, expect } from 'vitest';
import { FIREWALL_DEFAULTS } from '../../src/data/firewall-defaults.js';
import { translateDenyEntries } from '../../src/lib/opencode/permissions.js';

describe('FIREWALL_DEFAULTS — bypass-token secrets entries', () => {
  it('denies reading a literal `bypass.token` file at any depth', () => {
    expect(FIREWALL_DEFAULTS).toContain('Read(**/bypass.token)');
  });

  it('denies reading any path whose name contains "bypass" and "token"', () => {
    expect(FIREWALL_DEFAULTS).toContain('Read(**/*bypass*token*)');
  });

  it('translates cleanly into OpenCode read-permission rules', () => {
    const rules = translateDenyEntries(FIREWALL_DEFAULTS);
    expect(rules.some((r) => r.tool === 'read' && r.pattern === '**/bypass.token')).toBe(true);
    expect(rules.some((r) => r.tool === 'read' && r.pattern === '**/*bypass*token*')).toBe(true);
  });
});
