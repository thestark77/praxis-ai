// Plug-and-play bootstrap of gentle-ai from its official source.
//
// praxis-ai does NOT vendor gentle-ai. This module drives gentle-ai's own
// installer and headless CLI so a single `praxis install` leaves the user
// with gentle-ai + engram + the full ecosystem configured, then layers the
// praxis overlay on top.
//
// The configuration applied matches the praxis-recommended defaults:
//   - agents:  claude-code
//   - persona: neutral
//   - preset:  full-gentleman   (theme, context7, persona, engram, gga,
//                                opencode-logo, permissions, sdd, skills)
//   - models:  balanced         (gentle-ai's default when no model flags;
//                                opus arch / sonnet most / haiku archive)
//   - TDD:     strict (enabled; gentle-ai >= 4.0 retired the flag and made
//                                test-first development its default)
//
// Everything is fetched/driven from the source of truth:
//   - binary:    scripts/install.sh from the gentle-ai repo at the pinned
//                release tag (downloaded at runtime, executed, then
//                discarded — never committed here)
//   - ecosystem: `gentle-ai install` (gentle-ai downloads its own components)
//   - TDD:       `gentle-ai sync --strict-tdd` while gentle-ai still accepts
//                the flag, plain `gentle-ai sync` once it is retired
//
// Re-running is an update: gentle-ai's install/sync are idempotent. When
// gentle-ai is already configured, the bootstrap respects the user's
// existing choices unless `force` is set.

/**
 * The gentle-ai release praxis is validated against. Single source of truth:
 * the install.sh URL is pinned to this tag, and `praxis update` warns when
 * the installed binary differs. Bump deliberately, after re-validating.
 */
export const GENTLE_AI_VERSION = '3.7.0';

// Pinned to the release tag, never `main`: an unpinned installer lets an
// unreleased upstream change reach users without review.
export const GENTLE_AI_INSTALL_SCRIPT_URL = `https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/v${GENTLE_AI_VERSION}/scripts/install.sh`;

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a command and resolves with its result. Injectable for tests. */
export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export interface GentleAiBootstrapOptions {
  /** CSV agents flag value. Default: 'claude-code'. */
  agents?: string;
  /** Persona: gentleman | neutral | custom. Default: 'neutral'. */
  persona?: string;
  /** Preset: full-gentleman | ecosystem-only | minimal | custom. Default: 'full-gentleman'. */
  preset?: string;
  /**
   * Run the Strict TDD sync step (`gentle-ai sync --strict-tdd`). Default:
   * true. On a gentle-ai that retired the flag (>= 4.0) the sync runs without
   * it and `false` (`--no-strict-tdd`) only skips that sync: gentle-ai's
   * test-first default cannot be switched off from here.
   */
  strictTdd?: boolean;
  /** Reapply praxis defaults even if gentle-ai is already configured. */
  force?: boolean;

  // --- Injected detection state (from detector.ts) ---
  /** Whether the gentle-ai binary is already on PATH. */
  binaryPresent: boolean;
  /** Whether gentle-ai markers already exist in CLAUDE.md. */
  alreadyConfigured: boolean;

  // --- Injectable side-effects (defaults wired by the CLI layer) ---
  run?: CommandRunner;
  /** Returns the gentle-ai install.sh contents. Default: fetch from source. */
  fetchInstallScript?: () => Promise<string>;
}

/**
 * What became of the Strict TDD step:
 *  - `enabled`: synced with `--strict-tdd` (gentle-ai still accepts the flag);
 *  - `retired-by-gentle-ai`: gentle-ai retired the flag, so the sync ran
 *    without it (test-first is gentle-ai's default there);
 *  - `skipped`: not requested (`--no-strict-tdd`) or never reached;
 *  - `failed`: the sync step exited non-zero (see `warnings`).
 */
export type StrictTddOutcome = 'enabled' | 'retired-by-gentle-ai' | 'skipped' | 'failed';

export interface GentleAiBootstrapResult {
  skipped: boolean;
  skipReason?: string;
  ranBinaryInstall: boolean;
  ranEcosystemInstall: boolean;
  /** True when the sync step ran and succeeded (with or without the flag). */
  ranStrictTddSync: boolean;
  strictTdd: StrictTddOutcome;
  commands: string[];
  warnings: string[];
}

const DEFAULTS = {
  agents: 'claude-code',
  persona: 'neutral',
  preset: 'full-gentleman',
  strictTdd: true,
};

/** Whether the installed gentle-ai still accepts `sync --strict-tdd`. */
export type StrictTddSupport = 'supported' | 'retired' | 'unknown';

// Words gentle-ai uses on the `--strict-tdd` help line once the flag is gone
// (4.0.0: "Retired (rejected); applicable test-first ODD is default").
const RETIRED_MARKER = /retired|rejected|deprecated|removed|no longer/i;

/**
 * Classify the `--strict-tdd` flag from `gentle-ai sync --help` output.
 *
 * - listed without a retired marker -> `supported`
 * - listed with one (gentle-ai 4.0 still lists it, annotated) -> `retired`
 * - absent from what is recognizably a sync flag listing -> `retired`
 * - anything else (empty output, not a flag listing) -> `unknown`
 *
 * Capability detection rather than version pinning: it follows gentle-ai's
 * own help, so a future release needs no praxis change.
 */
export function parseStrictTddSupport(helpOutput: string): StrictTddSupport {
  const flagLine = helpOutput.split('\n').find((line) => /^\s*--strict-tdd(?![\w-])/.test(line));
  if (flagLine !== undefined) return RETIRED_MARKER.test(flagLine) ? 'retired' : 'supported';
  return /^\s*--agents?\b/m.test(helpOutput) ? 'retired' : 'unknown';
}

/** Probe `gentle-ai sync --help` (read-only). A failing probe is `unknown`. */
export async function probeStrictTddSupport(run: CommandRunner): Promise<StrictTddSupport> {
  const r = await run('gentle-ai', ['sync', '--help']);
  if (r.code !== 0) return 'unknown';
  return parseStrictTddSupport(`${r.stdout}\n${r.stderr}`);
}

/** True when a sync failed specifically because gentle-ai retired `--strict-tdd`. */
export function isStrictTddRetiredError(r: CommandResult): boolean {
  return r.code !== 0 && /--strict-tdd is retired/i.test(`${r.stderr}\n${r.stdout}`);
}

export interface GentleAiSyncRun {
  /** Result of the last `gentle-ai sync` attempt. */
  result: CommandResult;
  /** Every sync argv attempted, in order (a retry adds a second entry). */
  attempts: string[][];
  /** What happened to the Strict TDD flag on this run. */
  strictTdd: 'passed' | 'retired' | 'not-requested';
}

/**
 * Run `gentle-ai sync <baseArgs>`, adding `--strict-tdd` only while gentle-ai
 * accepts it.
 *
 * When the capability probe is inconclusive the flag is passed (the
 * pre-retirement behaviour) and, if gentle-ai answers with its specific
 * "--strict-tdd is retired" error, the sync is retried once without it. Any
 * other failure is returned untouched for the caller to surface.
 */
export async function runGentleAiSync(
  run: CommandRunner,
  baseArgs: string[],
  requestStrictTdd: boolean,
): Promise<GentleAiSyncRun> {
  const plainArgs = ['sync', ...baseArgs];
  if (!requestStrictTdd) {
    return {
      result: await run('gentle-ai', plainArgs),
      attempts: [plainArgs],
      strictTdd: 'not-requested',
    };
  }
  if ((await probeStrictTddSupport(run)) === 'retired') {
    return {
      result: await run('gentle-ai', plainArgs),
      attempts: [plainArgs],
      strictTdd: 'retired',
    };
  }
  const flagArgs = [...plainArgs, '--strict-tdd'];
  const first = await run('gentle-ai', flagArgs);
  if (!isStrictTddRetiredError(first)) {
    return { result: first, attempts: [flagArgs], strictTdd: 'passed' };
  }
  return {
    result: await run('gentle-ai', plainArgs),
    attempts: [flagArgs, plainArgs],
    strictTdd: 'retired',
  };
}

async function defaultFetchInstallScript(): Promise<string> {
  const res = await fetch(GENTLE_AI_INSTALL_SCRIPT_URL);
  if (!res.ok) {
    throw new Error(`fetch gentle-ai install.sh: HTTP ${res.status}`);
  }
  return res.text();
}

export const defaultCommandRunner: CommandRunner = async (command, args) => {
  const { spawn } = await import('node:child_process');
  return new Promise<CommandResult>((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c) => (stdout += String(c)));
    child.stderr?.on('data', (c) => (stderr += String(c)));
    child.on('error', (err) => resolve({ code: 127, stdout, stderr: stderr + String(err) }));
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
};
const defaultRunner = defaultCommandRunner;

/**
 * Bootstrap gentle-ai with the praxis-recommended configuration.
 *
 * Never throws on a gentle-ai-side failure: failures are collected as
 * warnings so the praxis overlay install can still proceed. The only hard
 * requirement is that `run` and `fetchInstallScript` behave.
 */
export async function bootstrapGentleAi(
  opts: GentleAiBootstrapOptions,
): Promise<GentleAiBootstrapResult> {
  const agents = opts.agents ?? DEFAULTS.agents;
  const persona = opts.persona ?? DEFAULTS.persona;
  const preset = opts.preset ?? DEFAULTS.preset;
  const strictTdd = opts.strictTdd ?? DEFAULTS.strictTdd;
  const force = opts.force ?? false;
  const run = opts.run ?? defaultRunner;
  const fetchScript = opts.fetchInstallScript ?? defaultFetchInstallScript;

  const result: GentleAiBootstrapResult = {
    skipped: false,
    ranBinaryInstall: false,
    ranEcosystemInstall: false,
    ranStrictTddSync: false,
    strictTdd: 'skipped',
    commands: [],
    warnings: [],
  };

  // Respect an existing gentle-ai configuration unless forced.
  if (opts.alreadyConfigured && !force) {
    result.skipped = true;
    result.skipReason =
      'gentle-ai is already configured (markers present in CLAUDE.md). ' +
      'Re-run with --force to reapply praxis defaults (neutral persona, ' +
      'full-gentleman preset, strict TDD).';
    return result;
  }

  // Step 1 — ensure the binary. Install when missing or when forced.
  if (!opts.binaryPresent || force) {
    try {
      const script = await fetchScript();
      const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const dir = await mkdtemp(join(tmpdir(), 'praxis-ga-install-'));
      const scriptPath = join(dir, 'install.sh');
      await writeFile(scriptPath, script, 'utf8');
      result.commands.push(`bash ${scriptPath}  # gentle-ai install.sh (from source)`);
      const r = await run('bash', [scriptPath]);
      if (r.code !== 0) {
        result.warnings.push(
          `gentle-ai binary install exited ${r.code}. ${r.stderr.slice(0, 300)}`,
        );
        await rm(dir, { recursive: true, force: true });
        // Without the binary the rest cannot run.
        return result;
      }
      result.ranBinaryInstall = true;
      await rm(dir, { recursive: true, force: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.warnings.push(`gentle-ai binary install failed: ${message}`);
      return result;
    }
  }

  // Step 2 — headless ecosystem install (9 components incl. engram).
  // Models default to balanced (no model flags = gentle-ai defaults).
  {
    const args = ['install', '--agents', agents, '--persona', persona, '--preset', preset];
    result.commands.push(`gentle-ai ${args.join(' ')}`);
    const r = await run('gentle-ai', args);
    if (r.code !== 0) {
      result.warnings.push(`gentle-ai install exited ${r.code}. ${r.stderr.slice(0, 300)}`);
      return result;
    }
    result.ranEcosystemInstall = true;
  }

  // Step 3 — enable Strict TDD (not exposed by `install`; sync owns it).
  // gentle-ai >= 4.0 retired the flag (test-first is its default), so the
  // flag is passed only while gentle-ai still accepts it.
  if (strictTdd) {
    const sync = await runGentleAiSync(run, ['--agents', agents], true);
    for (const attempt of sync.attempts) result.commands.push(`gentle-ai ${attempt.join(' ')}`);
    if (sync.result.code !== 0) {
      const last = sync.attempts[sync.attempts.length - 1];
      result.strictTdd = 'failed';
      result.warnings.push(
        `gentle-ai ${last.join(' ')} exited ${sync.result.code}. ${sync.result.stderr.slice(0, 300)}`,
      );
      return result;
    }
    result.ranStrictTddSync = true;
    result.strictTdd = sync.strictTdd === 'retired' ? 'retired-by-gentle-ai' : 'enabled';
  }

  return result;
}
