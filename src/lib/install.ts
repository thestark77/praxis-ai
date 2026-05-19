import { mkdir } from 'node:fs/promises';
import { resolvePaths, type PraxisPaths } from './paths.js';
import { detect, installModeFor, type InstallMode } from './detector.js';
import { createBackup } from './backup.js';
import { patchClaudeMd } from './claudemd-patcher.js';
import { patchSettings, unpatchSettings } from './settings-patcher.js';
import { installSkeleton, uninstallSkeleton, DEFAULT_TEMPLATES_ROOT } from './skeleton-installer.js';
import { unpatchClaudeMd } from './claudemd-patcher.js';
import { restoreLatestBackup } from './backup.js';
import { FIREWALL_DEFAULTS, PRAXIS_IMPORT_PATH } from '../data/firewall-defaults.js';

export interface InstallOptions {
  paths?: PraxisPaths;
  templatesRoot?: string;
  firewallEntries?: string[];
  importPath?: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface InstallResult {
  mode: InstallMode;
  backupPath: string | null;
  skeletonInstalled: string[];
  skeletonSkipped: string[];
  firewallEntriesAdded: number;
  claudeMdPatched: boolean;
  warnings: string[];
}

export async function runInstall(opts: InstallOptions = {}): Promise<InstallResult> {
  const paths = opts.paths ?? resolvePaths();
  const templatesRoot = opts.templatesRoot ?? DEFAULT_TEMPLATES_ROOT;
  const firewallEntries = opts.firewallEntries ?? FIREWALL_DEFAULTS;
  const importPath = opts.importPath ?? PRAXIS_IMPORT_PATH;
  const dryRun = opts.dryRun ?? false;

  const report = await detect(paths);
  const mode = installModeFor(report);
  const warnings: string[] = [];

  if (mode === 'no-claude-code') {
    throw new Error(
      `Claude Code config dir not found at ${paths.claudeDir}. ` +
        'Run `claude` once to initialise it, then retry praxis install.',
    );
  }

  if (mode === 'standalone') {
    warnings.push(
      'gentle-ai is not installed. Praxis runs in standalone mode without SDD or Strict TDD.',
    );
  } else if (mode === 'partial-overlay') {
    warnings.push(
      'gentle-ai binary found but its CLAUDE.md markers are missing. ' +
        'Run `gentle-ai install` and `/sdd-init` for full overlay mode.',
    );
  }

  if (dryRun) {
    return {
      mode,
      backupPath: null,
      skeletonInstalled: [],
      skeletonSkipped: [],
      firewallEntriesAdded: 0,
      claudeMdPatched: false,
      warnings,
    };
  }

  await mkdir(paths.backupsDir, { recursive: true });
  const backupPath = await createBackup([paths.claudeMd, paths.settingsJson], {
    backupsDir: paths.backupsDir,
  });

  const skeleton = await installSkeleton({
    templatesRoot,
    praxisDir: paths.praxisDir,
    overwrite: opts.force,
  });

  await patchClaudeMd(paths.claudeMd, importPath);
  await patchSettings(paths.settingsJson, firewallEntries);

  return {
    mode,
    backupPath,
    skeletonInstalled: skeleton.installed,
    skeletonSkipped: skeleton.skipped,
    firewallEntriesAdded: firewallEntries.length,
    claudeMdPatched: true,
    warnings,
  };
}

export interface UninstallOptions {
  paths?: PraxisPaths;
  firewallEntries?: string[];
  removeSkeleton?: boolean;
  keepBackup?: boolean;
}

export interface UninstallResult {
  removedClaudeMdBlock: boolean;
  removedFirewallEntries: number;
  removedSkeleton: boolean;
  restoredFromBackup: string | null;
}

export async function runUninstall(opts: UninstallOptions = {}): Promise<UninstallResult> {
  const paths = opts.paths ?? resolvePaths();
  const firewallEntries = opts.firewallEntries ?? FIREWALL_DEFAULTS;
  const removeSkeleton = opts.removeSkeleton ?? true;

  const removedClaudeMdBlock = await unpatchClaudeMd(paths.claudeMd);
  await unpatchSettings(paths.settingsJson, firewallEntries);

  if (removeSkeleton) {
    await uninstallSkeleton(paths.praxisDir);
  }

  return {
    removedClaudeMdBlock,
    removedFirewallEntries: firewallEntries.length,
    removedSkeleton: removeSkeleton,
    restoredFromBackup: null,
  };
}

export async function runRollback(opts: { paths?: PraxisPaths } = {}): Promise<string | null> {
  const paths = opts.paths ?? resolvePaths();
  const restored = await restoreLatestBackup(
    {
      'CLAUDE.md': paths.claudeMd,
      'settings.json': paths.settingsJson,
    },
    { backupsDir: paths.backupsDir },
  );
  return restored;
}
