import { homedir } from 'node:os';
import { join } from 'node:path';

export interface PraxisPaths {
  home: string;
  claudeDir: string;
  claudeMd: string;
  settingsJson: string;
  claudeSkillsDir: string;
  praxisDir: string;
  backupsDir: string;
  cacheDir: string;
  telemetryDb: string;
}

/**
 * Resolve the home directory praxis operates on.
 *
 * `PRAXIS_HOME` wins when set. This exists because `os.homedir()` is NOT
 * overridable on every platform: on POSIX it consults `$HOME` first, but on
 * Windows it reads `USERPROFILE` and ignores `HOME` entirely. Tests that set
 * `HOME` to a temp dir were therefore silently ineffective on Windows, and the
 * CLI operated on the developer's real `~/.claude` and `~/.praxis` — up to and
 * including `uninstall` stripping the live firewall.
 *
 * A dedicated variable rather than reading `HOME` directly is deliberate:
 * under Git Bash on Windows `HOME` is an MSYS path (`/c/Users/...`) that the
 * Windows build of Node cannot resolve, so honouring it would break real
 * users to accommodate tests.
 */
export function resolveHome(): string {
  const override = process.env.PRAXIS_HOME?.trim();
  return override ? override : homedir();
}

export interface OpenCodePaths {
  home: string;
  /** OpenCode global config dir — `~/.config/opencode` on every platform. */
  opencodeDir: string;
  opencodeJson: string;
  opencodeJsonc: string;
  pluginsDir: string;
  /** The praxis firewall plugin praxis emits into `plugins/`. */
  firewallPlugin: string;
  skillsDir: string;
  agentsMd: string;
}

/**
 * Resolve the OpenCode global config dir.
 *
 * OpenCode reads `$XDG_CONFIG_HOME/opencode` when that variable is set and
 * falls back to `<home>/.config/opencode` otherwise — verified against
 * `opencode debug paths` on Windows, where there is no `%APPDATA%\opencode`.
 *
 * `XDG_CONFIG_HOME` is deliberately ignored when `PRAXIS_HOME` is set: a test
 * that sandboxes the home must not leak into the developer's real OpenCode
 * config just because the ambient environment exports XDG_CONFIG_HOME. Same
 * failure class as the `HOME`-is-ignored-on-Windows bug that let the suite
 * disarm the live firewall.
 */
export function resolveOpenCodeDir(home: string = resolveHome()): string {
  const sandboxed = Boolean(process.env.PRAXIS_HOME?.trim());
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (!sandboxed && xdg) return join(xdg, 'opencode');
  return join(home, '.config', 'opencode');
}

export function resolveOpenCodePaths(home: string = resolveHome()): OpenCodePaths {
  const opencodeDir = resolveOpenCodeDir(home);
  const pluginsDir = join(opencodeDir, 'plugins');
  return {
    home,
    opencodeDir,
    opencodeJson: join(opencodeDir, 'opencode.json'),
    opencodeJsonc: join(opencodeDir, 'opencode.jsonc'),
    pluginsDir,
    firewallPlugin: join(pluginsDir, 'praxis-firewall.ts'),
    skillsDir: join(opencodeDir, 'skills'),
    agentsMd: join(opencodeDir, 'AGENTS.md'),
  };
}

export function resolvePaths(home: string = resolveHome()): PraxisPaths {
  const claudeDir = join(home, '.claude');
  const praxisDir = join(home, '.praxis');
  return {
    home,
    claudeDir,
    claudeMd: join(claudeDir, 'CLAUDE.md'),
    settingsJson: join(claudeDir, 'settings.json'),
    claudeSkillsDir: join(claudeDir, 'skills'),
    praxisDir,
    backupsDir: join(praxisDir, 'backups'),
    cacheDir: join(praxisDir, 'cache'),
    telemetryDb: join(praxisDir, 'telemetry.db'),
  };
}
