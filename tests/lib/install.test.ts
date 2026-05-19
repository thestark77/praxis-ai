import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInstall, runUninstall, runRollback } from '../../src/lib/install.js';
import { resolvePaths } from '../../src/lib/paths.js';
import { readSettings } from '../../src/lib/settings-patcher.js';
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
