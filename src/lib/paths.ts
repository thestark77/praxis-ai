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

export function resolvePaths(home: string = homedir()): PraxisPaths {
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
