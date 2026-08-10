import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolvePaths, resolveHome } from '../../src/lib/paths.js';

describe('resolvePaths', () => {
  it('resolves all paths under the given home', () => {
    const home = join('/fake', 'home');
    const paths = resolvePaths(home);
    // Expectations are built with join() on purpose: resolvePaths returns
    // host-native separators, so hardcoded POSIX strings would only ever pass
    // on POSIX and fail on Windows for no real defect.
    expect(paths.home).toBe(home);
    expect(paths.claudeDir).toBe(join(home, '.claude'));
    expect(paths.claudeMd).toBe(join(home, '.claude', 'CLAUDE.md'));
    expect(paths.settingsJson).toBe(join(home, '.claude', 'settings.json'));
    expect(paths.claudeSkillsDir).toBe(join(home, '.claude', 'skills'));
    expect(paths.praxisDir).toBe(join(home, '.praxis'));
    expect(paths.backupsDir).toBe(join(home, '.praxis', 'backups'));
    expect(paths.cacheDir).toBe(join(home, '.praxis', 'cache'));
    expect(paths.telemetryDb).toBe(join(home, '.praxis', 'telemetry.db'));
  });

  it('defaults to the resolved home when no argument', () => {
    const paths = resolvePaths();
    expect(paths.home).toBeTruthy();
    expect(paths.claudeMd).toContain('.claude');
  });
});

describe('resolveHome', () => {
  const original = process.env.PRAXIS_HOME;

  afterEach(() => {
    if (original === undefined) delete process.env.PRAXIS_HOME;
    else process.env.PRAXIS_HOME = original;
  });

  // Regression guard. os.homedir() consults $HOME on POSIX but reads
  // USERPROFILE on Windows and ignores HOME entirely, so tests that sandboxed
  // via HOME were silently ineffective there and the CLI mutated the real
  // ~/.claude and ~/.praxis — including uninstall stripping the live firewall.
  // PRAXIS_HOME must be honoured on every platform.
  it('honours PRAXIS_HOME over the OS home', () => {
    const sandbox = join('/tmp', 'praxis-sandbox');
    process.env.PRAXIS_HOME = sandbox;
    expect(resolveHome()).toBe(sandbox);
    expect(resolvePaths().praxisDir).toBe(join(sandbox, '.praxis'));
  });

  it('falls back to the OS home when PRAXIS_HOME is unset', () => {
    delete process.env.PRAXIS_HOME;
    expect(resolveHome()).toBe(homedir());
  });

  it('treats a blank PRAXIS_HOME as unset rather than as the cwd', () => {
    process.env.PRAXIS_HOME = '   ';
    expect(resolveHome()).toBe(homedir());
  });
});
