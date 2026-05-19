import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const binPath = resolve(__dirname, '..', 'bin', 'praxis.js');

function runCli(args: string, env: NodeJS.ProcessEnv = process.env): string {
  return execSync(`node ${binPath} ${args}`, { encoding: 'utf8', env });
}

async function makeSandboxHome(): Promise<string> {
  const sandboxHome = await mkdtemp(join(tmpdir(), 'praxis-cli-test-'));
  const claudeDir = join(sandboxHome, '.claude');
  await mkdir(claudeDir, { recursive: true });
  await writeFile(join(claudeDir, 'CLAUDE.md'), '', 'utf8');
  await writeFile(join(claudeDir, 'settings.json'), '{}\n', 'utf8');
  return sandboxHome;
}

describe('praxis CLI surface', () => {
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
});

describe('praxis CLI command wiring (sandboxed HOME)', () => {
  it('install --dry-run produces expected output and writes nothing', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('install --dry-run', { ...process.env, HOME: sandboxHome });
    expect(out).toContain('praxis-ai install');
    expect(out).toContain('--dry-run: no changes were written');
  });

  it('doctor reports overlay-not-installed on a fresh sandbox', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('doctor', { ...process.env, HOME: sandboxHome });
    expect(out).toContain('praxis-ai doctor');
    expect(out).toContain('overlay installed:  false');
  });

  it('rollback --list reports no backups on a fresh sandbox', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('rollback --list', { ...process.env, HOME: sandboxHome });
    expect(out).toContain('no backups found');
  });

  it('uninstall on fresh sandbox reports no praxis block removed', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('uninstall', { ...process.env, HOME: sandboxHome });
    expect(out).toContain('praxis-ai uninstall');
    expect(out).toContain('CLAUDE.md @-import removed: false');
  });
});
