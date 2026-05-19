import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const binPath = resolve(__dirname, '..', 'bin', 'praxis.js');

function runCli(args: string): string {
  return execSync(`node ${binPath} ${args}`, { encoding: 'utf8' });
}

describe('praxis CLI', () => {
  it('prints help with all 7 commands', () => {
    const out = runCli('--help');
    expect(out).toContain('praxis');
    expect(out).toContain('install');
    expect(out).toContain('uninstall');
    expect(out).toContain('upgrade');
    expect(out).toContain('doctor');
    expect(out).toContain('rollback');
    expect(out).toContain('stats');
    expect(out).toContain('context-usage');
  });

  it('prints version', () => {
    const out = runCli('--version').trim();
    expect(out).toBe('0.1.0-alpha.0');
  });

  it('install stub reports not-yet-implemented', () => {
    const out = runCli('install');
    expect(out).toContain('not yet implemented');
    expect(out).toContain('M1');
  });

  it('doctor stub reports not-yet-implemented', () => {
    const out = runCli('doctor');
    expect(out).toContain('not yet implemented');
  });
});
