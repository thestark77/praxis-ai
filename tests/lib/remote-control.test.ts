import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverEnvironments,
  applyToEnvironment,
  applyAll,
  statusAll,
  scanOverrides,
  listWslDistros,
  wslSettingsPath,
  REMOTE_CONTROL_KEY,
  type CommandRunner,
} from '../../src/lib/remote-control.js';

async function home(settings?: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-rc-'));
  if (settings) {
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(
      join(dir, '.claude', 'settings.json'),
      JSON.stringify(settings, null, 2),
      'utf8',
    );
  }
  return dir;
}

async function readSettings(dir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(dir, '.claude', 'settings.json'), 'utf8'));
}

const noWsl = { includeWsl: false };

describe('writing the setting', () => {
  it('turns it on in a home that has no settings file yet', async () => {
    const dir = await home();
    const [result] = await applyAll(true, { ...noWsl, home: dir });
    expect(result?.changed).toBe(true);
    expect(result?.current).toBe('on');
    expect((await readSettings(dir))[REMOTE_CONTROL_KEY]).toBe(true);
  });

  it('leaves every other setting exactly as it found it', async () => {
    // These files carry the user's model, output style, hooks and
    // permission rules. A Remote Control switch has no business
    // disturbing any of it.
    const dir = await home({
      model: 'opus',
      outputStyle: 'Neutral',
      permissions: { deny: ['Bash(rm -rf *)'] },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }] },
    });
    await applyAll(true, { ...noWsl, home: dir });
    const after = await readSettings(dir);
    expect(after.model).toBe('opus');
    expect(after.outputStyle).toBe('Neutral');
    expect(after.permissions).toEqual({ deny: ['Bash(rm -rf *)'] });
    expect(after.hooks).toBeDefined();
    expect(after[REMOTE_CONTROL_KEY]).toBe(true);
  });

  it('reports no change when it is already on', async () => {
    const dir = await home({ [REMOTE_CONTROL_KEY]: true });
    const [result] = await applyAll(true, { ...noWsl, home: dir });
    expect(result?.changed).toBe(false);
    expect(result?.previous).toBe('on');
  });

  it('flips an explicit off back to on', async () => {
    const dir = await home({ [REMOTE_CONTROL_KEY]: false });
    const [result] = await applyAll(true, { ...noWsl, home: dir });
    expect(result?.previous).toBe('off');
    expect(result?.current).toBe('on');
    expect(result?.changed).toBe(true);
  });

  it('removes the key entirely on reset', async () => {
    const dir = await home({ [REMOTE_CONTROL_KEY]: true, model: 'opus' });
    await applyAll(null, { ...noWsl, home: dir });
    const after = await readSettings(dir);
    expect(REMOTE_CONTROL_KEY in after).toBe(false);
    expect(after.model).toBe('opus');
  });

  it('refuses to overwrite a settings file it cannot parse', async () => {
    // Truncating somebody's configuration to fix one key would be a far
    // worse outcome than not setting it.
    const dir = await mkdtemp(join(tmpdir(), 'praxis-rc-'));
    await mkdir(join(dir, '.claude'), { recursive: true });
    const path = join(dir, '.claude', 'settings.json');
    await writeFile(path, '{ this is not json', 'utf8');
    const [result] = await applyAll(true, { ...noWsl, home: dir });
    expect(result?.changed).toBe(false);
    expect(result?.error).toMatch(/could not be parsed/);
    expect(await readFile(path, 'utf8')).toBe('{ this is not json');
  });
});

describe('reading the state', () => {
  it('calls a missing settings file unset, not off', async () => {
    const [status] = await statusAll({ ...noWsl, home: await home() });
    expect(status?.state).toBe('unset');
  });

  it('distinguishes off from unset', async () => {
    const off = await statusAll({ ...noWsl, home: await home({ [REMOTE_CONTROL_KEY]: false }) });
    const unset = await statusAll({ ...noWsl, home: await home({ model: 'opus' }) });
    expect(off[0]?.state).toBe('off');
    expect(unset[0]?.state).toBe('unset');
  });

  it('changes nothing', async () => {
    const dir = await home({ model: 'opus' });
    await statusAll({ ...noWsl, home: dir });
    expect(REMOTE_CONTROL_KEY in (await readSettings(dir))).toBe(false);
  });
});

describe('discovering WSL environments', () => {
  // A machine with WSL holds several Claude installations, each with its
  // own home and its own settings.json. A switch that edits only the
  // Windows one is not machine-wide, and nothing reports the gap.
  const fakeWsl: CommandRunner = (command, args) => {
    if (command !== 'wsl.exe') return { status: 1, stdout: '' };
    // wsl.exe writes UTF-16, which arrives full of NUL bytes.
    if (args[0] === '-l')
      return { status: 0, stdout: 'U\0b\0u\0n\0t\0u\0\r\n\0D\0e\0b\0i\0a\0n\0\r\n' };
    if (args.includes('echo -n "$HOME"')) {
      return { status: 0, stdout: `/home/${args[1] === 'Ubuntu' ? 'sebas' : 'other'}` };
    }
    if (args.includes('wslpath')) {
      return { status: 0, stdout: `\\\\wsl.localhost\\${args[1]}\\home\\x` };
    }
    return { status: 1, stdout: '' };
  };

  it('strips the NUL bytes wsl.exe emits', () => {
    expect(listWslDistros(fakeWsl)).toEqual(['Ubuntu', 'Debian']);
  });

  it('returns no distros when wsl.exe fails', () => {
    expect(listWslDistros(() => ({ status: 1, stdout: '' }))).toEqual([]);
  });

  it('translates a POSIX home into a path Windows can write', () => {
    expect(wslSettingsPath('Ubuntu', fakeWsl)).toContain('wsl.localhost');
    expect(wslSettingsPath('Ubuntu', fakeWsl)).toMatch(/settings\.json$/);
  });

  it('includes every distro alongside the host', async () => {
    const envs = await discoverEnvironments({
      home: await home(),
      includeWsl: true,
      run: fakeWsl,
    });
    expect(envs.map((e) => e.name)).toEqual(['windows', 'wsl:Ubuntu', 'wsl:Debian']);
  });

  it('does not list the same settings file twice', async () => {
    // Two distros can share a home through a bind mount; writing it twice
    // would double-report the change.
    const sameHome: CommandRunner = (command, args) => {
      if (args[0] === '-l') return { status: 0, stdout: 'A\r\nB\r\n' };
      if (args.includes('echo -n "$HOME"')) return { status: 0, stdout: '/home/shared' };
      if (args.includes('wslpath'))
        return { status: 0, stdout: '\\\\wsl.localhost\\A\\home\\shared' };
      return { status: 1, stdout: '' };
    };
    const envs = await discoverEnvironments({
      home: await home(),
      includeWsl: true,
      run: sameHome,
    });
    expect(envs).toHaveLength(2);
  });

  it('writes the setting into a home with no Claude installed yet', async () => {
    // Pre-seeding means a later `claude` install starts with it on,
    // instead of quietly being the one environment that misses out.
    const dir = await mkdtemp(join(tmpdir(), 'praxis-rc-'));
    const result = await applyToEnvironment(
      {
        name: 'wsl:Fresh',
        settingsPath: join(dir, '.claude', 'settings.json'),
        claudeInstalled: false,
      },
      true,
    );
    expect(result.changed).toBe(true);
    expect(
      JSON.parse(await readFile(join(dir, '.claude', 'settings.json'), 'utf8'))[REMOTE_CONTROL_KEY],
    ).toBe(true);
  });
});

describe('scanning for repositories that switch it off', () => {
  // This is what makes "every session" mean something: a user setting of
  // `true` is silently defeated by one repo saying `false`, and Claude
  // Code surfaces that only in a debug log.
  async function repo(root: string, name: string, value: unknown, file = 'settings.json') {
    const dir = join(root, name, '.claude');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, file), JSON.stringify({ [REMOTE_CONTROL_KEY]: value }), 'utf8');
  }

  it('finds a project settings file that disables it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'praxis-scan-'));
    await repo(root, 'work', false);
    const found = await scanOverrides({ roots: [root] });
    expect(found).toHaveLength(1);
    expect(found[0]?.value).toBe(false);
  });

  it('finds settings.local.json too', async () => {
    const root = await mkdtemp(join(tmpdir(), 'praxis-scan-'));
    await repo(root, 'work', false, 'settings.local.json');
    expect(await scanOverrides({ roots: [root] })).toHaveLength(1);
  });

  it('reports a repo that sets true, which Claude Code ignores', async () => {
    const root = await mkdtemp(join(tmpdir(), 'praxis-scan-'));
    await repo(root, 'work', true);
    const found = await scanOverrides({ roots: [root] });
    expect(found[0]?.value).toBe(true);
  });

  it('ignores a repo that does not mention the key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'praxis-scan-'));
    const dir = join(root, 'work', '.claude');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ model: 'opus' }), 'utf8');
    expect(await scanOverrides({ roots: [root] })).toEqual([]);
  });

  it('never reports the user settings file as an override of itself', async () => {
    // A scan rooted at the home directory walks straight into
    // ~/.claude/settings.json -- the very file `enable` writes.
    const root = await mkdtemp(join(tmpdir(), 'praxis-scan-'));
    const userSettings = join(root, '.claude', 'settings.json');
    await mkdir(join(root, '.claude'), { recursive: true });
    await writeFile(userSettings, JSON.stringify({ [REMOTE_CONTROL_KEY]: true }), 'utf8');
    expect(await scanOverrides({ roots: [root], exclude: [userSettings] })).toEqual([]);
    // Without the exclusion it is found, so the test proves the exclusion.
    expect(await scanOverrides({ roots: [root] })).toHaveLength(1);
  });

  it('does not descend into node_modules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'praxis-scan-'));
    await repo(root, join('node_modules', 'pkg'), false);
    expect(await scanOverrides({ roots: [root] })).toEqual([]);
  });

  it('survives a directory it cannot read', async () => {
    await expect(
      scanOverrides({ roots: [join(tmpdir(), 'praxis-does-not-exist-at-all')] }),
    ).resolves.toEqual([]);
  });

  it('stops at the depth limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'praxis-scan-'));
    await repo(root, join('a', 'b', 'c', 'd'), false);
    expect(await scanOverrides({ roots: [root], maxDepth: 1 })).toEqual([]);
    expect(await scanOverrides({ roots: [root], maxDepth: 6 })).toHaveLength(1);
  });
});
