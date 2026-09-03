// Turn Remote Control on for every Claude Code session on the machine.
//
// `remoteControlAtStartup` is a native Claude Code setting ("Start Remote
// Control bridge automatically each session"). Setting it by hand is one
// line; making it hold for *every* session is not, and that is what this
// module is for.
//
// Three facts drive the design, all read out of the Claude Code binary
// rather than assumed:
//
//   1. **A repo can switch it off and win.** Resolution returns
//      `{value: false, source: "project_or_local_false"}` the moment a
//      project or local settings file says `false`, before user settings
//      are consulted at all. A repo cannot switch it *on* -- the binary
//      logs "repo-scoped settings cannot enable Remote Control" and
//      ignores it. So the only way a machine-wide "on" quietly fails is a
//      repo saying `false`, which is why enable reports every one it finds
//      instead of only writing the user setting.
//
//   2. **It is a security-sensitive setting.** The binary reads it through
//      `getSecuritySensitiveSettingWithSources`, and an organization
//      policy can pin it ("Remote Control setting locked by org policy").
//      Where policy has pinned it, writing user settings changes nothing.
//
//   3. **One machine can hold several Claude installations.** On Windows,
//      each WSL distribution has its own home, its own Claude binary and
//      its own settings.json. Editing the Windows one leaves every WSL
//      session without Remote Control, and nothing reports the gap.
//
// praxis does not enable this during `praxis install`. Remote Control
// opens a bridge that lets another device drive the session, and a tool
// whose purpose is to contain irreversible actions should not switch on
// remote access as a side effect of being installed. It is exposed as an
// explicit command instead, so turning it on is a decision someone made.

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export const REMOTE_CONTROL_KEY = 'remoteControlAtStartup';

/** One Claude Code installation praxis can write settings for. */
export interface ClaudeEnvironment {
  /** Display name, e.g. `windows` or `wsl:Ubuntu`. */
  name: string;
  /** Absolute path to that environment's settings.json, in host terms. */
  settingsPath: string;
  /**
   * Absent when the environment has no Claude installation yet. praxis
   * still writes the setting, so a later install starts with it on.
   */
  claudeInstalled: boolean;
}

export type RemoteControlState = 'on' | 'off' | 'unset';

export interface EnvironmentStatus extends ClaudeEnvironment {
  state: RemoteControlState;
  /** Set when the settings file could not be read or parsed. */
  error?: string;
}

/** A project or local settings file that switches Remote Control off. */
export interface Override {
  path: string;
  /** The value found. Only `false` actually overrides; `true` is ignored. */
  value: boolean;
}

export interface CommandRunner {
  (command: string, args: string[]): { status: number | null; stdout: string };
}

const defaultRunner: CommandRunner = (command, args) => {
  const res = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  return { status: res.status, stdout: res.stdout ?? '' };
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Names of the WSL distributions registered on this machine.
 *
 * `wsl.exe -l -q` writes UTF-16 with a BOM, which arrives as text riddled
 * with NUL bytes; they are stripped rather than decoded, because the names
 * are ASCII in practice and a mis-decode would silently drop a distro.
 */
export function listWslDistros(run: CommandRunner = defaultRunner): string[] {
  if (process.platform !== 'win32') return [];
  const res = run('wsl.exe', ['-l', '-q']);
  if (res.status !== 0) return [];
  return res.stdout
    .replace(/\0/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** The POSIX home of a WSL distro, translated to a Windows path. */
export function wslSettingsPath(distro: string, run: CommandRunner = defaultRunner): string | null {
  const home = run('wsl.exe', ['-d', distro, '--', 'bash', '-lc', 'echo -n "$HOME"']);
  if (home.status !== 0) return null;
  const posixHome = home.stdout.replace(/\0/g, '').trim();
  if (!posixHome) return null;
  const win = run('wsl.exe', ['-d', distro, '--', 'wslpath', '-w', posixHome]);
  if (win.status !== 0) return null;
  const winHome = win.stdout.replace(/\0/g, '').trim();
  if (!winHome) return null;
  return join(winHome, '.claude', 'settings.json');
}

export interface DiscoverOptions {
  run?: CommandRunner;
  /** Override the host home directory. Tests set this. */
  home?: string;
  /** Skip WSL discovery. Tests set this. */
  includeWsl?: boolean;
}

/**
 * Every Claude Code environment on this machine.
 *
 * The host home always comes first. On Windows each WSL distro is added
 * too: they are separate installations with separate settings files, and
 * a machine-wide switch that skips them is not machine-wide.
 */
export async function discoverEnvironments(
  opts: DiscoverOptions = {},
): Promise<ClaudeEnvironment[]> {
  const run = opts.run ?? defaultRunner;
  const home = opts.home ?? homedir();
  const includeWsl = opts.includeWsl ?? process.platform === 'win32';

  const environments: ClaudeEnvironment[] = [];
  const hostSettings = join(home, '.claude', 'settings.json');
  environments.push({
    name: process.platform === 'win32' ? 'windows' : process.platform,
    settingsPath: hostSettings,
    claudeInstalled: await pathExists(dirname(hostSettings)),
  });

  if (!includeWsl) return environments;

  for (const distro of listWslDistros(run)) {
    const settingsPath = wslSettingsPath(distro, run);
    if (!settingsPath) continue;
    // Two distros can share a home (rare, but a bind mount does it), and
    // writing the same file twice would double-report.
    if (environments.some((e) => e.settingsPath === settingsPath)) continue;
    environments.push({
      name: `wsl:${distro}`,
      settingsPath,
      claudeInstalled: await pathExists(dirname(settingsPath)),
    });
  }

  return environments;
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    return null;
  }
}

function stateOf(settings: Record<string, unknown> | null): RemoteControlState {
  if (!settings) return 'unset';
  const value = settings[REMOTE_CONTROL_KEY];
  if (value === true) return 'on';
  if (value === false) return 'off';
  return 'unset';
}

/** Read the current state in every environment, changing nothing. */
export async function statusAll(opts: DiscoverOptions = {}): Promise<EnvironmentStatus[]> {
  const environments = await discoverEnvironments(opts);
  const out: EnvironmentStatus[] = [];
  for (const env of environments) {
    const settings = await readJson(env.settingsPath);
    out.push({
      ...env,
      state: stateOf(settings),
      error: settings === null ? 'settings.json is present but could not be parsed' : undefined,
    });
  }
  return out;
}

export interface ApplyResult {
  environment: ClaudeEnvironment;
  /** What the setting was before this run. */
  previous: RemoteControlState;
  /** What it is now. Equal to `previous` when nothing needed doing. */
  current: RemoteControlState;
  changed: boolean;
  error?: string;
}

/**
 * Write the setting into one environment.
 *
 * The file is read, one key is changed, and everything else is written
 * back untouched: these settings files carry the user's model, output
 * style, hooks and permission rules, and a Remote Control switch has no
 * business disturbing any of it. A file that exists but does not parse is
 * reported and left alone rather than overwritten.
 */
export async function applyToEnvironment(
  env: ClaudeEnvironment,
  desired: boolean | null,
): Promise<ApplyResult> {
  const settings = await readJson(env.settingsPath);
  if (settings === null) {
    return {
      environment: env,
      previous: 'unset',
      current: 'unset',
      changed: false,
      error: 'settings.json is present but could not be parsed; left untouched',
    };
  }

  const previous = stateOf(settings);
  const next = { ...settings };
  if (desired === null) delete next[REMOTE_CONTROL_KEY];
  else next[REMOTE_CONTROL_KEY] = desired;

  const current = stateOf(next);
  if (current === previous) {
    return { environment: env, previous, current, changed: false };
  }

  try {
    await mkdir(dirname(env.settingsPath), { recursive: true });
    await writeFile(env.settingsPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  } catch (err) {
    return {
      environment: env,
      previous,
      current: previous,
      changed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return { environment: env, previous, current, changed: true };
}

/** Apply to every environment. `null` clears the setting. */
export async function applyAll(
  desired: boolean | null,
  opts: DiscoverOptions = {},
): Promise<ApplyResult[]> {
  const environments = await discoverEnvironments(opts);
  const results: ApplyResult[] = [];
  for (const env of environments) {
    results.push(await applyToEnvironment(env, desired));
  }
  return results;
}

/** Directory names never worth descending into when scanning for overrides. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  'vendor',
  'target',
  '__pycache__',
  '.venv',
  'venv',
]);

export interface ScanOptions {
  /** Roots to scan. Defaults to the host home directory. */
  roots?: string[];
  /** How deep to descend. Deep trees are the norm; 6 covers real layouts. */
  maxDepth?: number;
  /**
   * Settings files that are user-scoped, not project-scoped.
   *
   * A scan rooted at the home directory walks straight into
   * `~/.claude/settings.json` -- the very file `enable` writes. Reporting
   * it as an override would tell the user their own machine-wide setting
   * is overriding itself.
   */
  exclude?: string[];
}

/**
 * Find project-scoped settings that switch Remote Control off.
 *
 * This is the part that makes "every session" mean something. A user
 * setting of `true` is silently defeated by a single repo whose
 * `.claude/settings.json` or `settings.local.json` says `false`, and
 * Claude Code surfaces that only in a debug log. Enabling without
 * reporting these would promise a guarantee the machine does not keep.
 *
 * A repo saying `true` is collected too, but flagged differently: the
 * binary ignores it outright, so it is a no-op the author probably
 * believes is working.
 */
export async function scanOverrides(opts: ScanOptions = {}): Promise<Override[]> {
  const roots = opts.roots ?? [homedir()];
  const maxDepth = opts.maxDepth ?? 6;
  const found: Override[] = [];
  const seen = new Set<string>();
  const excluded = new Set((opts.exclude ?? []).map((p) => p.toLowerCase()));

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory: not an error worth failing the scan
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name === '.claude') {
          for (const file of ['settings.json', 'settings.local.json']) {
            const candidate = join(full, file);
            if (seen.has(candidate)) continue;
            seen.add(candidate);
            if (excluded.has(candidate.toLowerCase())) continue;
            const settings = await readJson(candidate);
            const value = settings?.[REMOTE_CONTROL_KEY];
            if (typeof value === 'boolean') found.push({ path: candidate, value });
          }
          continue;
        }
        if (entry.name.startsWith('.')) continue;
        await walk(full, depth + 1);
      }
    }
  }

  for (const root of roots) await walk(root, 0);
  return found;
}
