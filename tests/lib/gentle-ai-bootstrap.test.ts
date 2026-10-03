import { describe, it, expect } from 'vitest';
import {
  bootstrapGentleAi,
  parseStrictTddSupport,
  GENTLE_AI_VERSION,
  GENTLE_AI_INSTALL_SCRIPT_URL,
  type CommandResult,
} from '../../src/lib/gentle-ai-bootstrap.js';

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

describe('GENTLE_AI_INSTALL_SCRIPT_URL', () => {
  it('pins install.sh to the tagged release, never to main', () => {
    expect(GENTLE_AI_VERSION).toBe('3.7.0');
    expect(GENTLE_AI_INSTALL_SCRIPT_URL).toBe(
      'https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/v3.7.0/scripts/install.sh',
    );
    expect(GENTLE_AI_INSTALL_SCRIPT_URL).not.toContain('/main/');
  });
});

const fetchScript = async () => '#!/usr/bin/env bash\necho fake-installer\n';

/** Real `gentle-ai sync --help` of v3.7.0 (flag accepted). */
const HELP_FLAG_SUPPORTED = `USAGE
  gentle-ai sync [flags]

FLAGS
  --agent, --agents <list>           Agents to sync
  --sdd-mode single|multi            SDD orchestrator mode
  --strict-tdd                       Enable strict TDD mode for SDD agents
  --include-permissions              Include permissions component
  --dry-run                          Preview plan without executing
  --help, -h                         Show this help
`;

/** Real `gentle-ai sync --help` of v4.0.0 (flag listed but rejected). */
const HELP_FLAG_RETIRED = `USAGE
  gentle-ai sync [flags]

FLAGS
  --agent, --agents <list>           Agents to sync
  --skill, --skills <list>           Skills to sync
  --strict-tdd                       Retired (rejected); applicable test-first ODD is default
  --include-permissions              Include permissions component
  --scope global|workspace           Sync scope (env: GENTLE_AI_INSTALL_SCOPE)
  --dry-run                          Preview plan without executing
  --help, -h                         Show this help
`;

/** A future listing that dropped the flag entirely. */
const HELP_FLAG_ABSENT = `USAGE
  gentle-ai sync [flags]

FLAGS
  --agent, --agents <list>           Agents to sync
  --skill, --skills <list>           Skills to sync
  --dry-run                          Preview plan without executing
`;

const RETIRED_ERROR =
  'Error: --strict-tdd is retired: ODD uses applicable test-first development by default; ' +
  'rerun `gentle-ai sync` without --strict-tdd (retain any other flags)';

const OK: CommandResult = { code: 0, stdout: '', stderr: '' };

/**
 * Fake gentle-ai CLI: `sync --help` answers with `help`, real `sync` calls go
 * through `sync(args)`, everything else succeeds.
 */
function gentleAiFake(
  opts: {
    help?: CommandResult;
    sync?: (args: string[]) => CommandResult;
  } = {},
) {
  const calls: RecordedCall[] = [];
  const run = async (command: string, args: string[]): Promise<CommandResult> => {
    calls.push({ command, args });
    if (command === 'gentle-ai' && args[0] === 'sync') {
      if (args.includes('--help')) return opts.help ?? { ...OK, stdout: HELP_FLAG_SUPPORTED };
      return opts.sync ? opts.sync(args) : OK;
    }
    return OK;
  };
  return { run, calls };
}

/** The `gentle-ai sync ...` invocations that are not the help probe. */
function syncCalls(calls: RecordedCall[]): string[][] {
  return calls
    .filter((c) => c.command === 'gentle-ai' && c.args[0] === 'sync' && !c.args.includes('--help'))
    .map((c) => c.args);
}

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
    expect(syncCalls(calls)).toEqual([['sync', '--agents', 'claude-code', '--strict-tdd']]);
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

describe('parseStrictTddSupport', () => {
  it('reads a listed, un-annotated flag as supported (gentle-ai 3.x)', () => {
    expect(parseStrictTddSupport(HELP_FLAG_SUPPORTED)).toBe('supported');
  });

  it('reads a listed flag annotated as retired as retired (gentle-ai 4.x)', () => {
    expect(parseStrictTddSupport(HELP_FLAG_RETIRED)).toBe('retired');
  });

  it.each(['rejected', 'deprecated', 'removed', 'no longer supported'])(
    'treats a "%s" annotation as retired',
    (word) => {
      const help = `FLAGS\n  --agents <list>   Agents\n  --strict-tdd   ${word}\n`;
      expect(parseStrictTddSupport(help)).toBe('retired');
    },
  );

  it('reads a flag missing from a recognizable listing as retired', () => {
    expect(parseStrictTddSupport(HELP_FLAG_ABSENT)).toBe('retired');
  });

  it('does not mistake --no-strict-tdd or other flags mentioning retired for the flag', () => {
    const help =
      'FLAGS\n  --agents <list>   Agents\n  --other   Retired thing\n  --strict-tdd   Enable it\n';
    expect(parseStrictTddSupport(help)).toBe('supported');
  });

  it('is unknown when the output is empty or not a flag listing', () => {
    expect(parseStrictTddSupport('')).toBe('unknown');
    expect(parseStrictTddSupport('command not found: gentle-ai')).toBe('unknown');
  });
});

describe('bootstrapGentleAi — strict-tdd flag capability', () => {
  const base = { binaryPresent: true, alreadyConfigured: false, fetchInstallScript: fetchScript };

  it('passes --strict-tdd when gentle-ai still supports it', async () => {
    const { run, calls } = gentleAiFake({ help: { ...OK, stdout: HELP_FLAG_SUPPORTED } });
    const result = await bootstrapGentleAi({ ...base, run });
    expect(syncCalls(calls)).toEqual([['sync', '--agents', 'claude-code', '--strict-tdd']]);
    expect(result.ranStrictTddSync).toBe(true);
    expect(result.strictTdd).toBe('enabled');
    expect(result.warnings).toEqual([]);
  });

  it('does NOT pass --strict-tdd when gentle-ai retired it, and warns about nothing', async () => {
    const { run, calls } = gentleAiFake({ help: { ...OK, stdout: HELP_FLAG_RETIRED } });
    const result = await bootstrapGentleAi({ ...base, run });
    // Other flags are kept; only the retired one is dropped.
    expect(syncCalls(calls)).toEqual([['sync', '--agents', 'claude-code']]);
    expect(result.ranStrictTddSync).toBe(true);
    expect(result.strictTdd).toBe('retired-by-gentle-ai');
    expect(result.warnings).toEqual([]);
    expect(result.commands).toContain('gentle-ai sync --agents claude-code');
  });

  it('keeps custom agents when dropping the retired flag', async () => {
    const { run, calls } = gentleAiFake({ help: { ...OK, stdout: HELP_FLAG_RETIRED } });
    await bootstrapGentleAi({ ...base, agents: 'claude-code,opencode', run });
    expect(syncCalls(calls)).toEqual([['sync', '--agents', 'claude-code,opencode']]);
  });

  it('does not pass the flag when a future gentle-ai dropped it from the help', async () => {
    const { run, calls } = gentleAiFake({ help: { ...OK, stdout: HELP_FLAG_ABSENT } });
    const result = await bootstrapGentleAi({ ...base, run });
    expect(syncCalls(calls)).toEqual([['sync', '--agents', 'claude-code']]);
    expect(result.warnings).toEqual([]);
  });

  it('falls back to passing the flag when the help probe fails (old behaviour)', async () => {
    const { run, calls } = gentleAiFake({ help: { code: 1, stdout: '', stderr: 'boom' } });
    const result = await bootstrapGentleAi({ ...base, run });
    expect(syncCalls(calls)).toEqual([['sync', '--agents', 'claude-code', '--strict-tdd']]);
    expect(result.strictTdd).toBe('enabled');
    expect(result.warnings).toEqual([]);
  });

  it('retries once without the flag when an unprobed sync answers "is retired"', async () => {
    const { run, calls } = gentleAiFake({
      help: { code: 1, stdout: '', stderr: 'boom' },
      sync: (args) =>
        args.includes('--strict-tdd') ? { code: 1, stdout: '', stderr: RETIRED_ERROR } : OK,
    });
    const result = await bootstrapGentleAi({ ...base, run });
    expect(syncCalls(calls)).toEqual([
      ['sync', '--agents', 'claude-code', '--strict-tdd'],
      ['sync', '--agents', 'claude-code'],
    ]);
    expect(result.ranStrictTddSync).toBe(true);
    expect(result.strictTdd).toBe('retired-by-gentle-ai');
    expect(result.warnings).toEqual([]);
  });

  it('still surfaces any other sync failure as a warning, without retrying', async () => {
    const { run, calls } = gentleAiFake({
      help: { ...OK, stdout: HELP_FLAG_SUPPORTED },
      sync: () => ({ code: 1, stdout: '', stderr: 'disk full' }),
    });
    const result = await bootstrapGentleAi({ ...base, run });
    expect(syncCalls(calls)).toHaveLength(1);
    expect(result.ranStrictTddSync).toBe(false);
    expect(result.strictTdd).toBe('failed');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/sync --agents claude-code --strict-tdd exited 1/);
    expect(result.warnings[0]).toMatch(/disk full/);
  });

  it('surfaces a failure of the flag-less sync on a retired gentle-ai', async () => {
    const { run } = gentleAiFake({
      help: { ...OK, stdout: HELP_FLAG_RETIRED },
      sync: () => ({ code: 2, stdout: '', stderr: 'permission denied' }),
    });
    const result = await bootstrapGentleAi({ ...base, run });
    expect(result.ranStrictTddSync).toBe(false);
    expect(result.strictTdd).toBe('failed');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/sync --agents claude-code exited 2/);
    expect(result.warnings[0]).not.toMatch(/--strict-tdd/);
    expect(result.warnings[0]).toMatch(/permission denied/);
  });

  it('does not probe or sync at all with --no-strict-tdd (strictTdd=false)', async () => {
    const { run, calls } = gentleAiFake({ help: { ...OK, stdout: HELP_FLAG_RETIRED } });
    const result = await bootstrapGentleAi({ ...base, strictTdd: false, run });
    expect(calls.some((c) => c.args[0] === 'sync')).toBe(false);
    expect(result.strictTdd).toBe('skipped');
    expect(result.ranStrictTddSync).toBe(false);
  });
});
