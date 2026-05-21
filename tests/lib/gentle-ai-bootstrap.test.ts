import { describe, it, expect } from 'vitest';
import { bootstrapGentleAi, type CommandResult } from '../../src/lib/gentle-ai-bootstrap.js';

interface RecordedCall {
  command: string;
  args: string[];
}

function fakeRunner(results: Record<string, CommandResult> = {}) {
  const calls: RecordedCall[] = [];
  const run = async (command: string, args: string[]): Promise<CommandResult> => {
    calls.push({ command, args });
    // Key by the meaningful token (subcommand or 'bash').
    const key = command === 'bash' ? 'bash' : (args[0] ?? command);
    return results[key] ?? { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

const fetchScript = async () => '#!/usr/bin/env bash\necho fake-installer\n';

describe('bootstrapGentleAi — fresh machine (no binary, not configured)', () => {
  it('runs binary install, ecosystem install, then strict-tdd sync in order', async () => {
    const { run, calls } = fakeRunner();
    const result = await bootstrapGentleAi({
      binaryPresent: false,
      alreadyConfigured: false,
      run,
      fetchInstallScript: fetchScript,
    });

    expect(result.skipped).toBe(false);
    expect(result.ranBinaryInstall).toBe(true);
    expect(result.ranEcosystemInstall).toBe(true);
    expect(result.ranStrictTddSync).toBe(true);

    expect(calls[0].command).toBe('bash'); // install.sh
    expect(calls[1].command).toBe('gentle-ai');
    expect(calls[1].args.slice(0, 1)).toEqual(['install']);
    expect(calls[1].args).toContain('--persona');
    expect(calls[1].args).toContain('neutral');
    expect(calls[1].args).toContain('--preset');
    expect(calls[1].args).toContain('full-gentleman');
    expect(calls[1].args).toContain('--agents');
    expect(calls[1].args).toContain('claude-code');
    expect(calls[2].args).toEqual(['sync', '--agents', 'claude-code', '--strict-tdd']);
  });
});

describe('bootstrapGentleAi — binary already present', () => {
  it('skips the binary install but still runs ecosystem + sync', async () => {
    const { run, calls } = fakeRunner();
    const result = await bootstrapGentleAi({
      binaryPresent: true,
      alreadyConfigured: false,
      run,
      fetchInstallScript: fetchScript,
    });
    expect(result.ranBinaryInstall).toBe(false);
    expect(result.ranEcosystemInstall).toBe(true);
    expect(result.ranStrictTddSync).toBe(true);
    // No bash (install.sh) call.
    expect(calls.find((c) => c.command === 'bash')).toBeUndefined();
    expect(calls[0].args[0]).toBe('install');
  });
});

describe('bootstrapGentleAi — already configured', () => {
  it('skips entirely unless forced', async () => {
    const { run, calls } = fakeRunner();
    const result = await bootstrapGentleAi({
      binaryPresent: true,
      alreadyConfigured: true,
      run,
      fetchInstallScript: fetchScript,
    });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toMatch(/already configured/i);
    expect(calls).toEqual([]);
  });

  it('force re-runs the full bootstrap', async () => {
    const { run, calls } = fakeRunner();
    const result = await bootstrapGentleAi({
      binaryPresent: true,
      alreadyConfigured: true,
      force: true,
      run,
      fetchInstallScript: fetchScript,
    });
    expect(result.skipped).toBe(false);
    expect(result.ranBinaryInstall).toBe(true); // force => reinstall binary too
    expect(result.ranEcosystemInstall).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('bootstrapGentleAi — config overrides + strict-tdd off', () => {
  it('honors custom persona/preset/agents and skips sync when strictTdd=false', async () => {
    const { run, calls } = fakeRunner();
    const result = await bootstrapGentleAi({
      binaryPresent: true,
      alreadyConfigured: false,
      persona: 'gentleman',
      preset: 'ecosystem-only',
      agents: 'claude-code,opencode',
      strictTdd: false,
      run,
      fetchInstallScript: fetchScript,
    });
    expect(result.ranStrictTddSync).toBe(false);
    expect(calls.find((c) => c.args.includes('--strict-tdd'))).toBeUndefined();
    const install = calls.find((c) => c.args[0] === 'install')!;
    expect(install.args).toContain('gentleman');
    expect(install.args).toContain('ecosystem-only');
    expect(install.args).toContain('claude-code,opencode');
  });
});

describe('bootstrapGentleAi — graceful failure', () => {
  it('stops after a failed binary install and records a warning (does not throw)', async () => {
    const { run, calls } = fakeRunner({ bash: { code: 1, stdout: '', stderr: 'boom' } });
    const result = await bootstrapGentleAi({
      binaryPresent: false,
      alreadyConfigured: false,
      run,
      fetchInstallScript: fetchScript,
    });
    expect(result.ranBinaryInstall).toBe(false);
    expect(result.ranEcosystemInstall).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/binary install exited 1/);
    // Did not attempt the ecosystem install after the binary failure.
    expect(calls.find((c) => c.command === 'gentle-ai')).toBeUndefined();
  });

  it('records a warning when the ecosystem install fails', async () => {
    const { run } = fakeRunner({ install: { code: 2, stdout: '', stderr: 'nope' } });
    const result = await bootstrapGentleAi({
      binaryPresent: true,
      alreadyConfigured: false,
      run,
      fetchInstallScript: fetchScript,
    });
    expect(result.ranEcosystemInstall).toBe(false);
    expect(result.ranStrictTddSync).toBe(false);
    expect(result.warnings.some((w) => /install exited 2/.test(w))).toBe(true);
  });
});
