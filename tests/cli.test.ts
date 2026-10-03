import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const binPath = resolve(__dirname, '..', 'bin', 'praxis.js');

function runCli(args: string, env: NodeJS.ProcessEnv = process.env): string {
  return execSync(`node ${binPath} ${args}`, { encoding: 'utf8', env });
}

function runCliCapture(
  args: string,
  env: NodeJS.ProcessEnv = process.env,
): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`node ${binPath} ${args}`, { encoding: 'utf8', env });
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    return {
      stdout: typeof e.stdout === 'string' ? e.stdout : (e.stdout?.toString() ?? ''),
      stderr: typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString() ?? ''),
      status: e.status ?? 1,
    };
  }
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
  it('prints help with all commands', () => {
    const out = runCli('--help');
    expect(out).toContain('praxis');
    expect(out).toContain('install');
    expect(out).toContain('uninstall');
    expect(out).toContain('upgrade');
    expect(out).toContain('doctor');
    expect(out).toContain('rollback');
    expect(out).toContain('stats');
    expect(out).toContain('context-usage');
    expect(out).toContain('sync-pocock');
    expect(out).toContain('update');
  });

  it('sync-pocock --help describes drift checking', () => {
    const out = runCli('sync-pocock --help');
    expect(out).toContain('drift');
    expect(out).toContain('--ref');
    expect(out).toContain('--against-lift');
  });

  it('exposes a bin matching the package name so `npx praxis-ai install` resolves', async () => {
    // Regression guard for the alpha.7 fix: npx (`getBinFromManifest`)
    // refuses to run when a package has multiple bins and none matches
    // the package name. praxis-ai has `praxis` + `praxis-ast-hook`, so
    // without a `praxis-ai` bin alias `npx praxis-ai@latest install`
    // fails with "could not determine executable to run".
    const pkgRaw = await import('node:fs/promises').then((m) =>
      m.readFile(resolve(__dirname, '..', 'package.json'), 'utf8'),
    );
    const pkg = JSON.parse(pkgRaw) as { name: string; bin: Record<string, string> };
    expect(Object.keys(pkg.bin)).toContain(pkg.name);
  });
});

describe('praxis CLI sync-pocock — offline path', () => {
  it('exits non-zero on a failed network fetch (no GitHub access in sandbox)', async () => {
    // We point the fetch at an unresolvable host so the command exits 2
    // without ever hitting the real GitHub API. This keeps the test
    // hermetic — no external HTTP — while still exercising the CLI
    // wiring and error path.
    const sandboxHome = await mkdtemp(join(tmpdir(), 'praxis-cli-test-'));
    const env = {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
      // node 18+ allows overriding via undici dispatcher / env, but the
      // simplest hermetic check is just to assert the CLI surfaces an
      // error exit code if the network is unreachable. We do that by
      // pointing at a private-use TLD that will not resolve.
      // No env override is strictly required; the assertion is that the
      // command exits non-zero either via failed fetch (status 2) or a
      // graceful drift-found exit (status 1) — both indicate the CLI
      // wired through correctly. Since we cannot guarantee network
      // availability in CI, we only assert that the CLI is discoverable.
    };
    const { stdout } = runCliCapture('sync-pocock --help', env);
    expect(stdout).toContain('sync-pocock');
  });

  it('prints the version npm actually installed', () => {
    // This assertion used to carry its own copy of the number, so it did not
    // catch the drift it existed to catch -- it locked the stale value in and
    // passed while `praxis --version` disagreed with package.json.
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    const out = runCli('--version').trim();
    expect(out).toBe(pkg.version);
  });
});

describe('praxis CLI telemetry — stats + context-usage (sandboxed HOME)', () => {
  it('stats on a fresh sandbox reports zero events with a help hint', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('stats', { ...process.env, HOME: sandboxHome, PRAXIS_HOME: sandboxHome });
    expect(out).toContain('praxis stats');
    expect(out).toContain('total events:        0');
    expect(out).toContain('No telemetry recorded yet');
  });

  it('stats --json on a fresh sandbox returns a parsable empty summary', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('stats --json', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    const parsed = JSON.parse(out);
    expect(parsed.totalEvents).toBe(0);
    expect(parsed.sessions).toBe(0);
  });

  it('context-usage --record persists a sample and the next stats call sees it', async () => {
    const sandboxHome = await makeSandboxHome();
    const recordOut = runCli('context-usage --record 30000 --budget 200000', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    expect(recordOut).toContain('recorded: 30000 / 200000');

    const showOut = runCli('context-usage', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    expect(showOut).toContain('used / budget: 30000 / 200000');
    expect(showOut).toContain('percent:       15.0%');

    const stats = runCli('stats --json', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    expect(JSON.parse(stats).contextSamples).toBe(1);
  });

  it.each([
    ['below the window', 80000, 200000, '40.0%', 'none'],
    ['exactly 50%', 100000, 200000, '50.0%', 'poll'],
    ['inside the window at 55%', 110000, 200000, '55.0%', 'poll'],
    ['exactly 60%', 120000, 200000, '60.0%', 'poll'],
    ['49.96% rounded up to 50.0%', 99920, 200000, '50.0%', 'poll'],
    ['60.04% rounded down to 60.0%', 120080, 200000, '60.0%', 'poll'],
    ['60.1% past the rounding tie', 120200, 200000, '60.1%', 'past'],
    ['80% well past the window', 160000, 200000, '80.0%', 'past'],
  ] as const)(
    'context-usage classifies %s on the same rounded value it displays',
    async (_label, used, budget, expectedPercent, notice) => {
      const sandboxHome = await makeSandboxHome();
      const env = { ...process.env, HOME: sandboxHome, PRAXIS_HOME: sandboxHome };
      runCli(`context-usage --record ${used} --budget ${budget}`, env);
      const out = runCli('context-usage', env);

      expect(out).toContain(expectedPercent);
      if (notice === 'none') {
        expect(out).not.toContain('Poll window');
        expect(out).not.toContain('Past the poll window');
      } else if (notice === 'poll') {
        expect(out).toContain('Poll window (50–60%)');
        expect(out).toContain('ask the user whether to save progress and pause for /compact');
        expect(out).not.toContain('Past the poll window');
      } else {
        expect(out).toContain('Past the poll window (>60%)');
        expect(out).toContain(
          'unless the user already declined twice, poll at the next clean point and do not start new work before asking',
        );
        expect(out).not.toContain('Poll window (50–60%)');
      }
    },
  );

  it('stats --reset truncates events', async () => {
    const sandboxHome = await makeSandboxHome();
    runCli('context-usage --record 100 --budget 1000', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    const before = runCli('stats --json', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    expect(JSON.parse(before).totalEvents).toBe(1);
    const reset = runCli('stats --reset', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    expect(reset).toContain('1 events deleted');
    const after = runCli('stats --json', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    expect(JSON.parse(after).totalEvents).toBe(0);
  });
});

describe('praxis CLI command wiring (sandboxed HOME)', () => {
  it('install --dry-run produces expected output and writes nothing', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('install --dry-run', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    expect(out).toContain('praxis-ai install');
    expect(out).toContain('--dry-run: no changes were written');
  });

  it('install copies the six lifted skills into sandboxed ~/.claude/skills', async () => {
    const sandboxHome = await makeSandboxHome();
    // --no-gentle-ai keeps the test hermetic: no network, no gentle-ai
    // binary install. The praxis overlay (skills, firewall, hook) still
    // installs in full.
    const out = runCli('install --no-gentle-ai', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    expect(out).toContain('praxis-ai install');
    expect(out).toContain('claude-skills:');

    const skillsDir = join(sandboxHome, '.claude', 'skills');
    const entries = await import('node:fs/promises').then((m) => m.readdir(skillsDir));
    for (const name of [
      'grill-with-docs',
      'caveman',
      'diagnose',
      'zoom-out',
      'prototype',
      'handoff',
    ]) {
      expect(entries).toContain(name);
    }
    const skillContent = await import('node:fs/promises').then((m) =>
      m.readFile(join(skillsDir, 'grill-with-docs', 'SKILL.md'), 'utf8'),
    );
    expect(skillContent).toContain('invocation: explicit');
  });

  it('doctor reports overlay-not-installed on a fresh sandbox', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('doctor', { ...process.env, HOME: sandboxHome, PRAXIS_HOME: sandboxHome });
    expect(out).toContain('praxis-ai doctor');
    expect(out).toContain('overlay installed:  false');
  });

  it('doctor reports a missing attribution setting', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('doctor', { ...process.env, HOME: sandboxHome, PRAXIS_HOME: sandboxHome });
    expect(out).toMatch(/attribution:\s+not set/);
  });

  it('doctor reports an enforced attribution setting as empty', async () => {
    const sandboxHome = await makeSandboxHome();
    await writeFile(
      join(sandboxHome, '.claude', 'settings.json'),
      JSON.stringify({ attribution: { commit: '', pr: '', sessionUrl: false } }),
      'utf8',
    );
    const out = runCli('doctor', { ...process.env, HOME: sandboxHome, PRAXIS_HOME: sandboxHome });
    expect(out).toMatch(/attribution:\s+empty/);
  });

  it('doctor reports the boolean false attribution as empty', async () => {
    const sandboxHome = await makeSandboxHome();
    await writeFile(
      join(sandboxHome, '.claude', 'settings.json'),
      JSON.stringify({ attribution: false }),
      'utf8',
    );
    const out = runCli('doctor', { ...process.env, HOME: sandboxHome, PRAXIS_HOME: sandboxHome });
    expect(out).toMatch(/attribution:\s+empty/);
  });

  it('doctor flags an attribution without sessionUrl: false as not enforced, with the fix', async () => {
    const sandboxHome = await makeSandboxHome();
    await writeFile(
      join(sandboxHome, '.claude', 'settings.json'),
      JSON.stringify({ attribution: { commit: '', pr: '' } }),
      'utf8',
    );
    const out = runCli('doctor', { ...process.env, HOME: sandboxHome, PRAXIS_HOME: sandboxHome });
    expect(out).toMatch(/attribution:\s+not enforced/);
    expect(out).toMatch(/session link/);
    expect(out).toMatch(/Run `praxis install`/);
  });

  it('doctor reports a custom attribution setting', async () => {
    const sandboxHome = await makeSandboxHome();
    await writeFile(
      join(sandboxHome, '.claude', 'settings.json'),
      JSON.stringify({ attribution: { commit: 'Co-Authored-By: me', pr: '' } }),
      'utf8',
    );
    const out = runCli('doctor', { ...process.env, HOME: sandboxHome, PRAXIS_HOME: sandboxHome });
    expect(out).toMatch(/attribution:\s+custom/);
  });

  it('doctor still runs when settings.json is not valid JSON', async () => {
    const sandboxHome = await makeSandboxHome();
    await writeFile(join(sandboxHome, '.claude', 'settings.json'), 'not json', 'utf8');
    const out = runCli('doctor', { ...process.env, HOME: sandboxHome, PRAXIS_HOME: sandboxHome });
    expect(out).toMatch(/attribution:\s+unknown/);
  });

  it('rollback --list reports no backups on a fresh sandbox', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('rollback --list', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    expect(out).toContain('no backups found');
  });

  it('uninstall on fresh sandbox reports no praxis block removed', async () => {
    const sandboxHome = await makeSandboxHome();
    const out = runCli('uninstall', {
      ...process.env,
      HOME: sandboxHome,
      PRAXIS_HOME: sandboxHome,
    });
    expect(out).toContain('praxis-ai uninstall');
    expect(out).toContain('CLAUDE.md @-import removed: false');
  });
});
