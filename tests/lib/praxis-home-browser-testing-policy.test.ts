import { describe, it, expect } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const pkgRoot = join(import.meta.dirname, '..', '..');
const templatesRoot = join(pkgRoot, 'templates', 'praxis-home');

describe('praxis-home browser-testing-policy module', () => {
  it('is imported from main.md before the balanced preset', async () => {
    const main = await readFile(join(templatesRoot, 'main.md'), 'utf8');
    expect(main).toContain('@browser-testing-policy.md');
    const importIndex = main.indexOf('@browser-testing-policy.md');
    const presetIndex = main.indexOf('@presets/balanced.md');
    expect(presetIndex).toBeGreaterThan(-1);
    expect(importIndex).toBeLessThan(presetIndex);
  });

  it('exists as a template file', async () => {
    const target = join(templatesRoot, 'browser-testing-policy.md');
    const exists = await stat(target);
    expect(exists.isFile()).toBe(true);
  });

  it('states the browser-use-first, playwright-fallback, disclosure, no-install, and untrusted-content clauses', async () => {
    const content = await readFile(join(templatesRoot, 'browser-testing-policy.md'), 'utf8');
    // Assert rule bodies, not only section headings.
    const flat = content.replace(/\s+/g, ' ');
    expect(flat).toContain('Browser Use FIRST');
    expect(flat).toContain('Playwright is ONLY the fallback');
    expect(flat).toContain('say so explicitly');
    expect(flat).toContain('Never install Playwright as the default path');
    expect(content).toContain('https://api.browser-use.com/mcp');
    expect(flat).toContain('mcp__browser-use__');
    expect(flat).toContain('untrusted data');
  });
});
