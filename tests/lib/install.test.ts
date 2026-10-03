import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInstall, runUninstall, runRollback } from '../../src/lib/install.js';
import { resolvePaths } from '../../src/lib/paths.js';
import { readSettings } from '../../src/lib/settings-patcher.js';
import { readOwnership, recordOwnership } from '../../src/lib/ownership.js';
import { hasPraxisBlock } from '../../src/lib/claudemd-patcher.js';

let home: string;
let templatesRoot: string;
let claudeSkillsTemplatesRoot: string;

async function makeTemplate(rel: string, content: string): Promise<void> {
  const full = join(templatesRoot, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf8');
}

async function makeClaudeSkillTemplate(rel: string, content: string): Promise<void> {
  const full = join(claudeSkillsTemplatesRoot, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf8');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'praxis-install-test-'));
  templatesRoot = join(home, 'templates', 'praxis-home');
  claudeSkillsTemplatesRoot = join(home, 'templates', 'claude-skills');
  await mkdir(templatesRoot, { recursive: true });
  await mkdir(claudeSkillsTemplatesRoot, { recursive: true });
  await makeTemplate('main.md', 'main entry');
  await makeTemplate('philosophy.md', 'philosophy');
  await makeTemplate('presets/balanced.md', 'balanced preset');
  // Two fake lifted skill dirs so installClaudeSkills has a real source.
  await makeClaudeSkillTemplate('grill-with-docs/SKILL.md', '---\nname: grill-with-docs\n---\n');
  await makeClaudeSkillTemplate('grill-with-docs/NOTICE.md', 'notice');
  // A fake praxis-native skill dir (no NOTICE.md — native skills have no
  // upstream to attribute) so installClaudeSkills exercises the combined
  // Pocock + native skill list. Carries the praxis-native marker, matching
  // the real shipped away-mode/SKILL.md, so an install-then-uninstall round
  // trip is recognized as praxis-owned.
  await makeClaudeSkillTemplate(
    'away-mode/SKILL.md',
    '---\nname: away-mode\npraxis-native: true\n---\n',
  );
});

describe('runInstall', () => {
  it('throws when ~/.claude does not exist', async () => {
    const paths = resolvePaths(home);
    await expect(runInstall({ paths, templatesRoot })).rejects.toThrow(
      /Claude Code config dir not found/,
    );
  });

  it('installs full overlay against gentle-ai fixture', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(
      paths.claudeMd,
      `<!-- gentle-ai:persona -->\npersona\n<!-- /gentle-ai:persona -->\n`,
      'utf8',
    );
    await writeFile(
      paths.settingsJson,
      JSON.stringify({ model: 'opus', permissions: { deny: ['Read(.env)'] } }, null, 2) + '\n',
      'utf8',
    );

    const result = await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      firewallEntries: ['Bash(rm -rf *)', 'Bash(git push --force*)'],
    });

    expect(result.mode).toMatch(/overlay|partial-overlay|standalone/);
    expect(result.backupPath).not.toBeNull();
    expect(result.skeletonInstalled.length).toBeGreaterThan(0);
    expect(result.claudeMdPatched).toBe(true);
    expect(result.firewallEntriesAdded).toBe(2);

    const claudeMd = await readFile(paths.claudeMd, 'utf8');
    expect(claudeMd).toContain('<!-- gentle-ai:persona -->');
    expect(hasPraxisBlock(claudeMd)).toBe(true);

    const settings = await readSettings(paths.settingsJson);
    expect(settings.permissions?.deny).toEqual([
      'Read(.env)',
      'Bash(rm -rf *)',
      'Bash(git push --force*)',
    ]);

    const mainExists = await pathExists(join(paths.praxisDir, 'main.md'));
    expect(mainExists).toBe(true);

    // The praxis-native away-mode skill installs alongside the lifted
    // Pocock ones, without requiring a NOTICE.md.
    expect(result.claudeSkillsInstalled).toContain('away-mode/SKILL.md');
    const awayModeExists = await pathExists(join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'));
    expect(awayModeExists).toBe(true);
  });

  it('--dry-run does not write any files', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(paths.claudeMd, 'existing\n', 'utf8');
    await writeFile(paths.settingsJson, '{}\n', 'utf8');

    const result = await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      dryRun: true,
    });
    expect(result.claudeMdPatched).toBe(false);
    expect(result.skeletonInstalled).toEqual([]);

    const claudeMd = await readFile(paths.claudeMd, 'utf8');
    expect(claudeMd).toBe('existing\n');
    const praxisDirExists = await pathExists(paths.praxisDir);
    expect(praxisDirExists).toBe(false);
  });

  it('reports a warning when standalone (no gentle-ai)', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(paths.claudeMd, 'no gentle-ai blocks\n', 'utf8');
    await writeFile(paths.settingsJson, '{}\n', 'utf8');
    const result = await runInstall({ paths, templatesRoot, claudeSkillsTemplatesRoot });
    if (result.mode === 'standalone') {
      expect(result.warnings.some((w) => /standalone/.test(w))).toBe(true);
    } else if (result.mode === 'partial-overlay') {
      expect(result.warnings.some((w) => /partial-overlay|markers are missing/.test(w))).toBe(true);
    }
  });

  it('is idempotent: re-running install does not break anything', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(paths.claudeMd, '', 'utf8');
    await writeFile(paths.settingsJson, '{}\n', 'utf8');

    const firewall = ['Bash(rm -rf *)'];
    await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      firewallEntries: firewall,
    });
    const firstClaudeMd = await readFile(paths.claudeMd, 'utf8');
    const firstSettings = await readFile(paths.settingsJson, 'utf8');

    await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      firewallEntries: firewall,
    });
    const secondClaudeMd = await readFile(paths.claudeMd, 'utf8');
    const secondSettings = await readFile(paths.settingsJson, 'utf8');

    expect(secondClaudeMd).toBe(firstClaudeMd);
    expect(secondSettings).toBe(firstSettings);
  });
});

describe('runUninstall', () => {
  it('removes praxis block, firewall rules, and skeleton', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(
      paths.claudeMd,
      `<!-- gentle-ai:persona -->\npersona\n<!-- /gentle-ai:persona -->\n`,
      'utf8',
    );
    await writeFile(
      paths.settingsJson,
      JSON.stringify({ permissions: { deny: ['Read(.env)'] } }, null, 2) + '\n',
      'utf8',
    );
    const firewall = ['Bash(rm -rf *)'];

    await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      firewallEntries: firewall,
    });
    const result = await runUninstall({ paths, firewallEntries: firewall });

    expect(result.removedClaudeMdBlock).toBe(true);
    expect(result.removedSkeleton).toBe(true);
    // The praxis-native away-mode skill uninstalls alongside the lifted
    // Pocock ones.
    expect(result.removedClaudeSkills).toContain('away-mode');
    expect(result.claudeSkillsSkippedNotOwned).toEqual([]);

    const claudeMd = await readFile(paths.claudeMd, 'utf8');
    expect(hasPraxisBlock(claudeMd)).toBe(false);
    expect(claudeMd).toContain('<!-- gentle-ai:persona -->');

    const settings = await readSettings(paths.settingsJson);
    expect(settings.permissions?.deny).toEqual(['Read(.env)']);

    // Install artefacts must be gone, but `backups/` survives so
    // `praxis rollback` is not orphaned by the uninstall that motivated
    // the rollback. See T14 scenario.
    const mainExists = await pathExists(join(paths.praxisDir, 'main.md'));
    expect(mainExists).toBe(false);
    const backupsDirExists = await pathExists(paths.backupsDir);
    expect(backupsDirExists).toBe(true);
  });

  it('leaves a user-authored away-mode skill directory in place on uninstall', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(paths.claudeMd, '', 'utf8');
    await writeFile(paths.settingsJson, '{}\n', 'utf8');
    const firewall = ['Bash(rm -rf *)'];

    await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      firewallEntries: firewall,
    });
    // The user replaces the installed away-mode skill with their own,
    // unmarked, version before uninstalling.
    await writeFile(
      join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'),
      '---\nname: away-mode\ndescription: my own thing\n---\nmy own body\n',
      'utf8',
    );

    const result = await runUninstall({ paths, firewallEntries: firewall });

    expect(result.removedClaudeSkills).not.toContain('away-mode');
    expect(result.claudeSkillsSkippedNotOwned).toContain('away-mode');
    const preserved = await readFile(join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'), 'utf8');
    expect(preserved).toContain('my own body');
  });

  it('does not overwrite a user-authored away-mode skill dir even with force: true', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(paths.claudeMd, '', 'utf8');
    await writeFile(paths.settingsJson, '{}\n', 'utf8');

    await runInstall({ paths, templatesRoot, claudeSkillsTemplatesRoot });
    // The user replaces the installed away-mode skill with their own,
    // unmarked, version before reinstalling with --force.
    await writeFile(
      join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'),
      '---\nname: away-mode\ndescription: my own thing\n---\nmy own body\n',
      'utf8',
    );

    const result = await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      force: true,
    });

    expect(result.claudeSkillsInstalled).not.toContain('away-mode/SKILL.md');
    expect(result.claudeSkillsSkippedNotOwned).toContain('away-mode');
    const preserved = await readFile(join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'), 'utf8');
    expect(preserved).toContain('my own body');
  });

  it('still overwrites a praxis-owned away-mode skill dir with force: true', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(paths.claudeMd, '', 'utf8');
    await writeFile(paths.settingsJson, '{}\n', 'utf8');

    await runInstall({ paths, templatesRoot, claudeSkillsTemplatesRoot });
    await writeFile(
      join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'),
      '---\nname: away-mode\npraxis-native: true\n---\nstale body\n',
      'utf8',
    );

    const result = await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      force: true,
    });

    expect(result.claudeSkillsInstalled).toContain('away-mode/SKILL.md');
    expect(result.claudeSkillsSkippedNotOwned).toEqual([]);
  });

  it('keeps skeleton when removeSkeleton is false', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(paths.claudeMd, '', 'utf8');
    await writeFile(paths.settingsJson, '{}\n', 'utf8');
    const firewall = ['Bash(rm -rf *)'];

    await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      firewallEntries: firewall,
    });
    await runUninstall({ paths, firewallEntries: firewall, removeSkeleton: false });
    const praxisDirExists = await pathExists(paths.praxisDir);
    expect(praxisDirExists).toBe(true);
  });
});

describe('runRollback', () => {
  it('restores CLAUDE.md and settings.json from the latest backup', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    const originalClaudeMd = `<!-- gentle-ai:persona -->\npersona body\n<!-- /gentle-ai:persona -->\n`;
    const originalSettings = JSON.stringify({ model: 'opus' }, null, 2) + '\n';
    await writeFile(paths.claudeMd, originalClaudeMd, 'utf8');
    await writeFile(paths.settingsJson, originalSettings, 'utf8');

    await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      firewallEntries: ['Bash(rm -rf *)'],
    });

    const restored = await runRollback({ paths });
    expect(restored).not.toBeNull();

    const claudeMd = await readFile(paths.claudeMd, 'utf8');
    expect(claudeMd).toBe(originalClaudeMd);
    const settings = await readFile(paths.settingsJson, 'utf8');
    expect(settings).toBe(originalSettings);
  });

  it('returns null when no backups exist', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.backupsDir, { recursive: true });
    const restored = await runRollback({ paths });
    expect(restored).toBeNull();
  });
});

describe('the Claude Code attribution setting', () => {
  const firewall = ['Bash(rm -rf *)'];
  const ENFORCED = { commit: '', pr: '', sessionUrl: false };
  // What release 0.1.0-alpha.30 and earlier wrote: no sessionUrl key.
  const TWO_KEY = { commit: '', pr: '' };

  async function sandbox(settings: Record<string, unknown>) {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(paths.claudeMd, '', 'utf8');
    await writeFile(paths.settingsJson, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    return paths;
  }

  const install = (paths: ReturnType<typeof resolvePaths>, force = false) =>
    runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      firewallEntries: firewall,
      force,
    });

  it('writes empty commit and pr and hides the session link in a fresh settings file', async () => {
    const paths = await sandbox({});
    const result = await install(paths);

    expect(result.attribution).toBe('written');
    const settings = await readSettings(paths.settingsJson);
    expect(settings.attribution).toEqual(ENFORCED);
    expect('includeCoAuthoredBy' in settings).toBe(false);
  });

  it('preserves every unrelated settings key', async () => {
    const original = {
      model: 'opus',
      enabledPlugins: { 'engram@engram': true },
      permissions: { defaultMode: 'bypassPermissions', deny: ['Read(.env)'] },
    };
    const paths = await sandbox(original);
    await install(paths);

    const settings = await readSettings(paths.settingsJson);
    expect(settings.model).toBe('opus');
    expect(settings.enabledPlugins).toEqual({ 'engram@engram': true });
    expect(settings.permissions?.defaultMode).toBe('bypassPermissions');
    expect(settings.permissions?.deny).toEqual(['Read(.env)', 'Bash(rm -rf *)']);
  });

  it('is idempotent: a second install leaves settings.json byte-identical', async () => {
    const paths = await sandbox({ model: 'opus' });
    await install(paths);
    const first = await readFile(paths.settingsJson, 'utf8');

    const second = await install(paths);
    expect(second.attribution).toBe('unchanged');
    expect(await readFile(paths.settingsJson, 'utf8')).toBe(first);
  });

  it('does not touch settings.json attribution on --dry-run', async () => {
    const paths = await sandbox({ model: 'opus' });
    const before = await readFile(paths.settingsJson, 'utf8');
    const result = await runInstall({
      paths,
      templatesRoot,
      claudeSkillsTemplatesRoot,
      dryRun: true,
    });
    expect(result.attribution).toBeNull();
    expect(await readFile(paths.settingsJson, 'utf8')).toBe(before);
  });

  it('keeps a custom attribution without --force and says so', async () => {
    const custom = { commit: 'Co-Authored-By: me', pr: 'my footer' };
    const paths = await sandbox({ attribution: custom });
    const result = await install(paths);

    expect(result.attribution).toBe('kept-custom');
    expect(result.warnings.some((w) => /attribution/.test(w) && /--force/.test(w))).toBe(true);
    expect((await readSettings(paths.settingsJson)).attribution).toEqual(custom);
  });

  it('replaces a custom attribution with --force', async () => {
    const paths = await sandbox({ attribution: { commit: 'Co-Authored-By: me', pr: 'x' } });
    const result = await install(paths, true);

    expect(result.attribution).toBe('written');
    expect((await readSettings(paths.settingsJson)).attribution).toEqual(ENFORCED);
  });

  it('does not write attribution when only OpenCode is targeted', async () => {
    const paths = await sandbox({ model: 'opus' });
    const before = await readFile(paths.settingsJson, 'utf8');
    // Pin the sandbox: without PRAXIS_HOME, an ambient XDG_CONFIG_HOME (set on
    // GitHub's Ubuntu runners) sends the OpenCode install to the runner's real
    // config dir, which then leaks into later tests.
    const savedPraxisHome = process.env.PRAXIS_HOME;
    process.env.PRAXIS_HOME = home;
    let result: Awaited<ReturnType<typeof runInstall>>;
    try {
      result = await runInstall({
        paths,
        agents: 'opencode',
        templatesRoot,
        claudeSkillsTemplatesRoot,
      });
    } finally {
      if (savedPraxisHome === undefined) delete process.env.PRAXIS_HOME;
      else process.env.PRAXIS_HOME = savedPraxisHome;
    }
    expect(result.attribution).toBeNull();
    expect(await readFile(paths.settingsJson, 'utf8')).toBe(before);
  });

  it('uninstall removes the key it added and leaves the other settings alone', async () => {
    const paths = await sandbox({ model: 'opus' });
    await install(paths);

    const result = await runUninstall({ paths, firewallEntries: firewall });

    expect(result.attributionReverted).toBe(true);
    const settings = await readSettings(paths.settingsJson);
    expect('attribution' in settings).toBe(false);
    expect(settings.model).toBe('opus');
    expect(settings.permissions?.deny).toEqual([]);
  });

  it('uninstall restores the previous custom value that --force replaced', async () => {
    const custom = { commit: 'Co-Authored-By: me', pr: 'my footer' };
    const paths = await sandbox({ attribution: custom });
    await install(paths, true);

    await runUninstall({ paths, firewallEntries: firewall });

    expect((await readSettings(paths.settingsJson)).attribution).toEqual(custom);
  });

  it('a repeated install keeps the original previous value for uninstall', async () => {
    const custom = { commit: 'Co-Authored-By: me', pr: 'my footer' };
    const paths = await sandbox({ attribution: custom });
    await install(paths, true);
    await install(paths, true);

    await runUninstall({ paths, firewallEntries: firewall });

    expect((await readSettings(paths.settingsJson)).attribution).toEqual(custom);
  });

  it('uninstall leaves a fully enforced attribution the user had set before praxis', async () => {
    const paths = await sandbox({ attribution: { ...ENFORCED } });
    const installed = await install(paths);
    expect(installed.attribution).toBe('unchanged');
    expect((await readOwnership(paths.praxisDir))?.attribution).toBeUndefined();

    const result = await runUninstall({ paths, firewallEntries: firewall });

    expect(result.attributionReverted).toBe(false);
    expect((await readSettings(paths.settingsJson)).attribution).toEqual(ENFORCED);
  });

  it('leaves the boolean false the user set alone and counts it as enforced', async () => {
    const paths = await sandbox({ attribution: false });
    const installed = await install(paths);
    expect(installed.attribution).toBe('unchanged');
    expect((await readSettings(paths.settingsJson)).attribution).toBe(false);
    expect((await readOwnership(paths.praxisDir))?.attribution).toBeUndefined();

    const result = await runUninstall({ paths, firewallEntries: firewall });

    expect(result.attributionReverted).toBe(false);
    expect((await readSettings(paths.settingsJson)).attribution).toBe(false);
  });

  describe('a host whose attribution has commit and pr empty but no sessionUrl: false', () => {
    it('adds sessionUrl: false to a two-key value the user wrote before praxis, without --force', async () => {
      const paths = await sandbox({ attribution: { ...TWO_KEY } });
      const result = await install(paths);

      expect(result.attribution).toBe('written');
      expect((await readSettings(paths.settingsJson)).attribution).toEqual(ENFORCED);
      expect((await readOwnership(paths.praxisDir))?.attribution).toEqual({
        present: true,
        value: TWO_KEY,
      });
    });

    it('uninstall gives that user-owned two-key value back exactly', async () => {
      const paths = await sandbox({ attribution: { ...TWO_KEY } });
      await install(paths);

      const result = await runUninstall({ paths, firewallEntries: firewall });

      expect(result.attributionReverted).toBe(true);
      expect((await readSettings(paths.settingsJson)).attribution).toEqual(TWO_KEY);
    });

    it('overrides an explicit sessionUrl: true and uninstall restores it', async () => {
      const before = { commit: '', pr: '', sessionUrl: true };
      const paths = await sandbox({ attribution: before });
      const result = await install(paths);

      expect(result.attribution).toBe('written');
      expect((await readSettings(paths.settingsJson)).attribution).toEqual(ENFORCED);

      const removed = await runUninstall({ paths, firewallEntries: firewall });
      expect(removed.attributionReverted).toBe(true);
      expect((await readSettings(paths.settingsJson)).attribution).toEqual(before);
    });

    it('keeps unknown sibling fields while it completes the value', async () => {
      const paths = await sandbox({ attribution: { ...TWO_KEY, future: 'keep' } });
      await install(paths);
      expect((await readSettings(paths.settingsJson)).attribution).toEqual({
        ...ENFORCED,
        future: 'keep',
      });
    });

    describe('written by release alpha.30, which recorded what was there before praxis', () => {
      // alpha.30 wrote the two-key form and recorded the pre-praxis value in the
      // ledger; the upgrade must keep that record, not the intermediate value.
      async function tramoOneHost(previous: { present: boolean; value?: unknown }) {
        const paths = await sandbox({ model: 'opus', attribution: { ...TWO_KEY } });
        await recordOwnership(paths.praxisDir, { attribution: previous });
        return paths;
      }

      it('upgrades to the three-key form and keeps the record that the key was absent', async () => {
        const paths = await tramoOneHost({ present: false });
        const result = await install(paths);

        expect(result.attribution).toBe('written');
        expect((await readSettings(paths.settingsJson)).attribution).toEqual(ENFORCED);
        expect((await readOwnership(paths.praxisDir))?.attribution).toEqual({ present: false });
      });

      it('uninstall after the upgrade removes the key praxis added', async () => {
        const paths = await tramoOneHost({ present: false });
        await install(paths);

        const result = await runUninstall({ paths, firewallEntries: firewall });

        expect(result.attributionReverted).toBe(true);
        const settings = await readSettings(paths.settingsJson);
        expect('attribution' in settings).toBe(false);
        expect(settings.model).toBe('opus');
      });

      it('uninstall after the upgrade restores a custom value --force replaced in alpha.30', async () => {
        const custom = { commit: 'Co-Authored-By: me', pr: 'my footer' };
        const paths = await tramoOneHost({ present: true, value: custom });
        await install(paths);
        expect((await readOwnership(paths.praxisDir))?.attribution).toEqual({
          present: true,
          value: custom,
        });

        await runUninstall({ paths, firewallEntries: firewall });

        expect((await readSettings(paths.settingsJson)).attribution).toEqual(custom);
      });

      it('uninstall without re-installing still reverts the two-key form alpha.30 wrote', async () => {
        const paths = await tramoOneHost({ present: false });

        const result = await runUninstall({ paths, firewallEntries: firewall });

        expect(result.attributionReverted).toBe(true);
        expect('attribution' in (await readSettings(paths.settingsJson))).toBe(false);
      });

      it('replaces the record when the user set sessionUrl: true after alpha.30 wrote the value', async () => {
        const edited = { commit: '', pr: '', sessionUrl: true };
        const paths = await sandbox({ attribution: edited });
        await recordOwnership(paths.praxisDir, { attribution: { present: false } });

        await install(paths);
        await runUninstall({ paths, firewallEntries: firewall });

        expect((await readSettings(paths.settingsJson)).attribution).toEqual(edited);
      });

      it('a second install after the upgrade changes nothing and keeps the record', async () => {
        const paths = await tramoOneHost({ present: false });
        await install(paths);
        const first = await readFile(paths.settingsJson, 'utf8');

        const second = await install(paths);

        expect(second.attribution).toBe('unchanged');
        expect(await readFile(paths.settingsJson, 'utf8')).toBe(first);
        expect((await readOwnership(paths.praxisDir))?.attribution).toEqual({ present: false });
      });
    });
  });

  it('uninstall leaves a value the user changed after install', async () => {
    const paths = await sandbox({});
    await install(paths);
    const edited = { commit: 'edited later', pr: '' };
    const current = await readSettings(paths.settingsJson);
    await writeFile(
      paths.settingsJson,
      JSON.stringify({ ...current, attribution: edited }),
      'utf8',
    );

    const result = await runUninstall({ paths, firewallEntries: firewall });

    expect(result.attributionReverted).toBe(false);
    expect((await readSettings(paths.settingsJson)).attribution).toEqual(edited);
  });

  it('rollback restores a settings.json that had no attribution key', async () => {
    const original = JSON.stringify({ model: 'opus' }, null, 2) + '\n';
    const paths = await sandbox({ model: 'opus' });
    await install(paths);
    expect((await readSettings(paths.settingsJson)).attribution).toEqual(ENFORCED);

    await runRollback({ paths });

    expect(await readFile(paths.settingsJson, 'utf8')).toBe(original);
  });

  it('rollback restores the previous custom attribution after --force', async () => {
    const custom = { commit: 'Co-Authored-By: me', pr: 'my footer' };
    const paths = await sandbox({ attribution: custom });
    await install(paths, true);

    await runRollback({ paths });

    expect((await readSettings(paths.settingsJson)).attribution).toEqual(custom);
  });
});
