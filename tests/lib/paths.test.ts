import { describe, it, expect } from 'vitest';
import { resolvePaths } from '../../src/lib/paths.js';

describe('resolvePaths', () => {
  it('resolves all paths under the given home', () => {
    const paths = resolvePaths('/fake/home');
    expect(paths.home).toBe('/fake/home');
    expect(paths.claudeDir).toBe('/fake/home/.claude');
    expect(paths.claudeMd).toBe('/fake/home/.claude/CLAUDE.md');
    expect(paths.settingsJson).toBe('/fake/home/.claude/settings.json');
    expect(paths.praxisDir).toBe('/fake/home/.praxis');
    expect(paths.backupsDir).toBe('/fake/home/.praxis/backups');
    expect(paths.cacheDir).toBe('/fake/home/.praxis/cache');
    expect(paths.telemetryDb).toBe('/fake/home/.praxis/telemetry.db');
  });

  it('defaults to os.homedir() when no argument', () => {
    const paths = resolvePaths();
    expect(paths.home).toBeTruthy();
    expect(paths.claudeMd).toContain('.claude');
  });
});
