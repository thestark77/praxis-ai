import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePaths } from '../../src/lib/paths.js';
import { createBackup, restoreLatestBackup } from '../../src/lib/backup.js';
import { patchClaudeMd, unpatchClaudeMd, hasPraxisBlock } from '../../src/lib/claudemd-patcher.js';
import {
  patchSettings,
  unpatchSettings,
  readSettings,
} from '../../src/lib/settings-patcher.js';
import { detect, installModeFor } from '../../src/lib/detector.js';

const PRAXIS_DENY_FIXTURE = [
  'Bash(rm -rf *)',
  'Bash(git push --force*)',
  'Bash(*--no-verify*)',
];

const PRAXIS_IMPORT = '~/.praxis/main.md';

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('integration: install flow on empty fixture', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'praxis-flow-empty-'));
  });

  it('detects no-claude-code, then a full install + uninstall round trip', async () => {
    const paths = resolvePaths(home);

    let report = await detect(paths);
    expect(installModeFor(report)).toBe('no-claude-code');

    await mkdir(paths.claudeDir, { recursive: true });
    await mkdir(paths.backupsDir, { recursive: true });

    await createBackup([paths.claudeMd, paths.settingsJson], { backupsDir: paths.backupsDir });
    await patchClaudeMd(paths.claudeMd, PRAXIS_IMPORT);
    await patchSettings(paths.settingsJson, PRAXIS_DENY_FIXTURE);

    report = await detect(paths);
    expect(report.praxis.overlayInstalled).toBe(true);
    expect(report.claude.claudeMdExists).toBe(true);
    expect(report.claude.settingsJsonExists).toBe(true);

    const settings = await readSettings(paths.settingsJson);
    expect(settings.permissions?.deny).toEqual(PRAXIS_DENY_FIXTURE);

    const removed = await unpatchClaudeMd(paths.claudeMd);
    expect(removed).toBe(true);
    await unpatchSettings(paths.settingsJson, PRAXIS_DENY_FIXTURE);

    const finalReport = await detect(paths);
    expect(finalReport.praxis.overlayInstalled).toBe(false);
    const finalSettings = await readSettings(paths.settingsJson);
    expect(finalSettings.permissions?.deny).toEqual([]);
  });
});

describe('integration: install flow on gentle-ai fixture', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'praxis-flow-gentleai-'));
  });

  it('preserves all gentle-ai blocks and user settings; restores byte-identical on uninstall', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await mkdir(paths.backupsDir, { recursive: true });

    const gentleAiClaudeMd =
      `<!-- gentle-ai:persona -->\npersona body\n<!-- /gentle-ai:persona -->\n\n` +
      `<!-- gentle-ai:engram-protocol -->\nengram body\n<!-- /gentle-ai:engram-protocol -->\n\n` +
      `<!-- gentle-ai:sdd-orchestrator -->\nsdd body\n<!-- /gentle-ai:sdd-orchestrator -->\n`;
    const userSettings = {
      model: 'opus',
      enabledPlugins: { 'engram@engram': true },
      permissions: {
        defaultMode: 'bypassPermissions',
        deny: ['Bash(rm -rf /)', 'Read(.env)'],
      },
    };

    await writeFile(paths.claudeMd, gentleAiClaudeMd, 'utf8');
    await writeFile(paths.settingsJson, JSON.stringify(userSettings, null, 2) + '\n', 'utf8');

    const originalClaudeMd = await readFile(paths.claudeMd, 'utf8');

    await createBackup([paths.claudeMd, paths.settingsJson], { backupsDir: paths.backupsDir });
    await patchClaudeMd(paths.claudeMd, PRAXIS_IMPORT);
    await patchSettings(paths.settingsJson, PRAXIS_DENY_FIXTURE);

    const patchedClaudeMd = await readFile(paths.claudeMd, 'utf8');
    expect(patchedClaudeMd).toContain('<!-- gentle-ai:persona -->');
    expect(patchedClaudeMd).toContain('<!-- gentle-ai:engram-protocol -->');
    expect(patchedClaudeMd).toContain('<!-- gentle-ai:sdd-orchestrator -->');
    expect(hasPraxisBlock(patchedClaudeMd)).toBe(true);

    const gentleAiSddEnd = patchedClaudeMd.indexOf('<!-- /gentle-ai:sdd-orchestrator -->');
    const praxisStart = patchedClaudeMd.indexOf('<!-- praxis:start -->');
    expect(praxisStart).toBeGreaterThan(gentleAiSddEnd);

    const patchedSettings = await readSettings(paths.settingsJson);
    expect(patchedSettings.model).toBe('opus');
    expect(patchedSettings.enabledPlugins).toEqual({ 'engram@engram': true });
    expect(patchedSettings.permissions?.deny).toEqual([
      'Bash(rm -rf /)',
      'Read(.env)',
      ...PRAXIS_DENY_FIXTURE,
    ]);
    expect(patchedSettings.permissions?.defaultMode).toBe('bypassPermissions');

    await patchClaudeMd(paths.claudeMd, PRAXIS_IMPORT);
    await patchSettings(paths.settingsJson, PRAXIS_DENY_FIXTURE);
    const claudeMdAfterSecondInstall = await readFile(paths.claudeMd, 'utf8');
    const settingsAfterSecondInstall = await readFile(paths.settingsJson, 'utf8');
    expect(claudeMdAfterSecondInstall).toBe(patchedClaudeMd);
    expect(settingsAfterSecondInstall).toBe(JSON.stringify(patchedSettings, null, 2) + '\n');

    await unpatchClaudeMd(paths.claudeMd);
    await unpatchSettings(paths.settingsJson, PRAXIS_DENY_FIXTURE);

    const restoredClaudeMd = await readFile(paths.claudeMd, 'utf8');
    expect(restoredClaudeMd.trim()).toBe(originalClaudeMd.trim());
    const restoredSettings = await readSettings(paths.settingsJson);
    expect(restoredSettings.permissions?.deny).toEqual(['Bash(rm -rf /)', 'Read(.env)']);
    expect(restoredSettings.model).toBe('opus');
  });

  it('rollback from latest backup recovers original state after corruption', async () => {
    const paths = resolvePaths(home);
    await mkdir(paths.claudeDir, { recursive: true });
    await mkdir(paths.backupsDir, { recursive: true });

    const original = `<!-- gentle-ai:persona -->\nbody\n<!-- /gentle-ai:persona -->\n`;
    await writeFile(paths.claudeMd, original, 'utf8');
    await writeFile(paths.settingsJson, JSON.stringify({ model: 'opus' }) + '\n', 'utf8');

    await createBackup([paths.claudeMd, paths.settingsJson], { backupsDir: paths.backupsDir });

    await writeFile(paths.claudeMd, 'corrupted content', 'utf8');
    await writeFile(paths.settingsJson, 'not valid json', 'utf8');
    expect(await fileExists(paths.claudeMd)).toBe(true);

    const ts = await restoreLatestBackup(
      { 'CLAUDE.md': paths.claudeMd, 'settings.json': paths.settingsJson },
      { backupsDir: paths.backupsDir },
    );
    expect(ts).not.toBeNull();

    const restoredClaudeMd = await readFile(paths.claudeMd, 'utf8');
    expect(restoredClaudeMd).toBe(original);
    const restoredSettings = await readSettings(paths.settingsJson);
    expect(restoredSettings.model).toBe('opus');
  });
});
