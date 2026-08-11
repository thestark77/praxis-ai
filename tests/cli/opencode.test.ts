import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const binPath = resolve(__dirname, '..', '..', 'bin', 'praxis.js');

function runCli(args: string, sandboxHome: string): string {
  return execSync(`node ${binPath} ${args}`, {
    encoding: 'utf8',
    env: { ...process.env, HOME: sandboxHome, PRAXIS_HOME: sandboxHome },
  });
}

function runCliCapture(args: string, sandboxHome: string): { stdout: string; status: number } {
  try {
    return { stdout: runCli(args, sandboxHome), status: 0 };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; status?: number };
    return {
      stdout: typeof e.stdout === 'string' ? e.stdout : (e.stdout?.toString() ?? ''),
      status: e.status ?? 1,
    };
  }
}

/**
 * A sandbox with BOTH harnesses initialised, so `--agent` selection is
 * actually exercised rather than falling through to the only one present.
 */
async function makeDualSandbox(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'praxis-cli-oc-'));
  const claudeDir = join(home, '.claude');
  await mkdir(claudeDir, { recursive: true });
  await writeFile(join(claudeDir, 'CLAUDE.md'), '', 'utf8');
  await writeFile(join(claudeDir, 'settings.json'), '{}\n', 'utf8');
  const opencodeDir = join(home, '.config', 'opencode');
  await mkdir(opencodeDir, { recursive: true });
  await writeFile(
    join(opencodeDir, 'opencode.json'),
    JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        agent: { gentleman: { mode: 'primary' } },
        permission: { bash: { '*': 'allow', 'git commit *': 'ask' } },
      },
      null,
      2,
    ),
    'utf8',
  );
  return home;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('praxis install --agent (sandboxed HOME)', () => {
  it('rejects an unknown agent instead of guessing', async () => {
    const home = await makeDualSandbox();
    const res = runCliCapture('install --agent cursor --no-gentle-ai', home);
    expect(res.status).toBe(1);
    expect(res.stdout + '').not.toContain('praxis-ai install\n  mode');
  });

  it('auto targets both harnesses when both are initialised', async () => {
    const home = await makeDualSandbox();
    const out = runCli('install --no-gentle-ai', home);
    expect(out).toContain('agents: claude-code, opencode');
    expect(out).toContain('opencode');
    expect(out).toContain('permission denies:');
  });

  it('--agent opencode leaves ~/.claude untouched', async () => {
    const home = await makeDualSandbox();
    runCli('install --agent opencode --no-gentle-ai', home);

    const claudeMd = await readFile(join(home, '.claude', 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toBe('');
    const settings = JSON.parse(await readFile(join(home, '.claude', 'settings.json'), 'utf8'));
    expect(settings.permissions).toBeUndefined();
    expect(settings.hooks).toBeUndefined();

    const config = JSON.parse(
      await readFile(join(home, '.config', 'opencode', 'opencode.json'), 'utf8'),
    ) as { permission: { bash: Record<string, string> }; instructions: string[] };
    expect(config.permission.bash['rm -rf *']).toBe('deny');
    expect(config.instructions.some((i) => i.includes('.praxis'))).toBe(true);
  });

  it('installs the three OpenCode layers and doctor --verify proves layer 2 runs', async () => {
    const home = await makeDualSandbox();
    runCli('install --agent opencode --no-gentle-ai', home);

    const pluginPath = join(home, '.config', 'opencode', 'plugins', 'praxis-firewall.ts');
    expect(await exists(pluginPath)).toBe(true);
    expect(await exists(join(home, '.config', 'opencode', 'skills', 'caveman', 'SKILL.md'))).toBe(
      true,
    );

    const doctor = runCli('doctor --agent opencode --verify', home);
    expect(doctor).toContain('OpenCode');
    expect(doctor).toContain('instructions entry: true');
    expect(doctor).toContain('engine resolvable');
    expect(doctor).toContain('AST plugin verify (opencode)');
    expect(doctor).toContain('synthetic deny: PASS');
    expect(doctor).toContain('status: ✓ overlay healthy');
  });

  it('doctor reports a not-fully-installed OpenCode before install', async () => {
    const home = await makeDualSandbox();
    const out = runCli('doctor --agent opencode', home);
    expect(out).toContain('permission denies:  0/');
    expect(out).toContain('firewall plugin:    not installed');
    expect(out).toContain('not fully installed');
  });

  it('uninstall --agent opencode reverts its own layers and keeps foreign config', async () => {
    const home = await makeDualSandbox();
    runCli('install --agent opencode --no-gentle-ai', home);
    const out = runCli('uninstall --agent opencode', home);
    expect(out).toContain('firewall plugin removed: true');
    expect(out).toContain('instructions entry removed: true');

    const config = JSON.parse(
      await readFile(join(home, '.config', 'opencode', 'opencode.json'), 'utf8'),
    ) as { permission: { bash: Record<string, string> }; instructions?: string[]; agent: unknown };
    expect(config.permission.bash['rm -rf *']).toBeUndefined();
    expect(config.permission.bash['git commit *']).toBe('ask');
    expect(config.agent).toEqual({ gentleman: { mode: 'primary' } });
    expect(config.instructions).toBeUndefined();
    expect(await exists(join(home, '.config', 'opencode', 'plugins', 'praxis-firewall.ts'))).toBe(
      false,
    );
  });

  it('backs opencode.json up so rollback restores the pre-praxis config byte for byte', async () => {
    const home = await makeDualSandbox();
    const configPath = join(home, '.config', 'opencode', 'opencode.json');
    const before = await readFile(configPath, 'utf8');

    runCli('install --agent opencode --no-gentle-ai', home);
    expect(await readFile(configPath, 'utf8')).not.toBe(before);

    const out = runCli('rollback', home);
    expect(out).toContain('restored from backup');
    expect(await readFile(configPath, 'utf8')).toBe(before);
  });
});
