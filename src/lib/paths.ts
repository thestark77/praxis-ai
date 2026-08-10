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
