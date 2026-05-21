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
//   - TDD:     strict (enabled)
//
// Everything is fetched/driven from the source of truth:
//   - binary:    scripts/install.sh from the gentle-ai repo (downloaded at
//                runtime, executed, then discarded — never committed here)
//   - ecosystem: `gentle-ai install` (gentle-ai downloads its own components)
//   - TDD:       `gentle-ai sync --strict-tdd`
//
// Re-running is an update: gentle-ai's install/sync are idempotent. When
// gentle-ai is already configured, the bootstrap respects the user's
// existing choices unless `force` is set.

export const GENTLE_AI_INSTALL_SCRIPT_URL =
  'https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/scripts/install.sh';

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
  /** Enable Strict TDD via `gentle-ai sync --strict-tdd`. Default: true. */
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

export interface GentleAiBootstrapResult {
  skipped: boolean;
  skipReason?: string;
  ranBinaryInstall: boolean;
  ranEcosystemInstall: boolean;
  ranStrictTddSync: boolean;
  commands: string[];
  warnings: string[];
}

const DEFAULTS = {
  agents: 'claude-code',
  persona: 'neutral',
  preset: 'full-gentleman',
  strictTdd: true,
};

async function defaultFetchInstallScript(): Promise<string> {
  const res = await fetch(GENTLE_AI_INSTALL_SCRIPT_URL);
  if (!res.ok) {
    throw new Error(`fetch gentle-ai install.sh: HTTP ${res.status}`);
  }
  return res.text();
}

const defaultRunner: CommandRunner = async (command, args) => {
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
  if (strictTdd) {
    const args = ['sync', '--agents', agents, '--strict-tdd'];
    result.commands.push(`gentle-ai ${args.join(' ')}`);
    const r = await run('gentle-ai', args);
    if (r.code !== 0) {
      result.warnings.push(
        `gentle-ai sync --strict-tdd exited ${r.code}. ${r.stderr.slice(0, 300)}`,
      );
      return result;
    }
    result.ranStrictTddSync = true;
  }

  return result;
}
