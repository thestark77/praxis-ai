import { mkdir } from 'node:fs/promises';
import { resolvePaths, type PraxisPaths } from './paths.js';
import { detect, installModeFor, type InstallMode } from './detector.js';
import { createBackup } from './backup.js';
import { patchClaudeMd } from './claudemd-patcher.js';
import {
  patchSettings,
  unpatchSettings,
  addPraxisAstHook,
  removePraxisAstHook,
  readSettings,
  writeSettings,
} from './settings-patcher.js';
import {
  installSkeleton,
  uninstallSkeleton,
  installClaudeSkills,
  uninstallClaudeSkills,
  DEFAULT_TEMPLATES_ROOT,
  DEFAULT_CLAUDE_SKILLS_TEMPLATES_ROOT,
} from './skeleton-installer.js';
import { unpatchClaudeMd } from './claudemd-patcher.js';
import { restoreLatestBackup } from './backup.js';
import { FIREWALL_DEFAULTS, PRAXIS_IMPORT_PATH } from '../data/firewall-defaults.js';
import { POCOCK_SKILL_NAMES } from '../data/pocock-skills.js';

export interface InstallOptions {
  paths?: PraxisPaths;
  templatesRoot?: string;
  claudeSkillsTemplatesRoot?: string;
  firewallEntries?: string[];
  importPath?: string;
  /** Shell command Claude Code should execute as the AST PreToolUse hook. */
  astHookCommand?: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface InstallResult {
  mode: InstallMode;
  backupPath: string | null;
  skeletonInstalled: string[];
  skeletonSkipped: string[];
  claudeSkillsInstalled: string[];
  claudeSkillsSkipped: string[];
  firewallEntriesAdded: number;
  claudeMdPatched: boolean;
  astHookRegistered: boolean;
  warnings: string[];
}

/**
 * Default shell command for the praxis AST PreToolUse hook. Resolves to
 * the bin shim inside the installed package; users can override via
 * InstallOptions.astHookCommand.
 */
export const DEFAULT_AST_HOOK_COMMAND = 'praxis-ast-hook';

export async function runInstall(opts: InstallOptions = {}): Promise<InstallResult> {
  const paths = opts.paths ?? resolvePaths();
  const templatesRoot = opts.templatesRoot ?? DEFAULT_TEMPLATES_ROOT;
  const claudeSkillsTemplatesRoot =
    opts.claudeSkillsTemplatesRoot ?? DEFAULT_CLAUDE_SKILLS_TEMPLATES_ROOT;
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
      claudeSkillsInstalled: [],
      claudeSkillsSkipped: [],
      firewallEntriesAdded: 0,
      claudeMdPatched: false,
      astHookRegistered: false,
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

  const claudeSkills = await installClaudeSkills({
    templatesRoot: claudeSkillsTemplatesRoot,
    claudeSkillsDir: paths.claudeSkillsDir,
    skills: POCOCK_SKILL_NAMES,
    overwrite: opts.force,
  });

  await patchClaudeMd(paths.claudeMd, importPath);
  await patchSettings(paths.settingsJson, firewallEntries);

  const astHookCommand = opts.astHookCommand ?? DEFAULT_AST_HOOK_COMMAND;
  const settingsBeforeHook = await readSettings(paths.settingsJson);
  const settingsWithHook = addPraxisAstHook(settingsBeforeHook, astHookCommand);
  await writeSettings(paths.settingsJson, settingsWithHook);

  return {
    mode,
    backupPath,
    skeletonInstalled: skeleton.installed,
    skeletonSkipped: skeleton.skipped,
    claudeSkillsInstalled: claudeSkills.installed,
    claudeSkillsSkipped: claudeSkills.skipped,
    firewallEntriesAdded: firewallEntries.length,
    claudeMdPatched: true,
    astHookRegistered: true,
    warnings,
  };
}

export interface UninstallOptions {
  paths?: PraxisPaths;
  firewallEntries?: string[];
  removeSkeleton?: boolean;
  removeClaudeSkills?: boolean;
  keepBackup?: boolean;
}

export interface UninstallResult {
  removedClaudeMdBlock: boolean;
  removedFirewallEntries: number;
  removedSkeleton: boolean;
  removedClaudeSkills: string[];
  removedAstHook: boolean;
  restoredFromBackup: string | null;
}

export async function runUninstall(opts: UninstallOptions = {}): Promise<UninstallResult> {
  const paths = opts.paths ?? resolvePaths();
  const firewallEntries = opts.firewallEntries ?? FIREWALL_DEFAULTS;
  const removeSkeleton = opts.removeSkeleton ?? true;
  const removeClaudeSkillsFlag = opts.removeClaudeSkills ?? true;

  const removedClaudeMdBlock = await unpatchClaudeMd(paths.claudeMd);
  await unpatchSettings(paths.settingsJson, firewallEntries);

  // Remove the praxis AST hook entry from settings.json.
  const settingsBeforeHook = await readSettings(paths.settingsJson);
  const settingsWithoutHook = removePraxisAstHook(settingsBeforeHook);
  const removedAstHook =
    JSON.stringify(settingsBeforeHook.hooks ?? {}) !==
    JSON.stringify(settingsWithoutHook.hooks ?? {});
  await writeSettings(paths.settingsJson, settingsWithoutHook);

  if (removeSkeleton) {
    await uninstallSkeleton(paths.praxisDir);
  }

  const removedClaudeSkills = removeClaudeSkillsFlag
    ? await uninstallClaudeSkills(paths.claudeSkillsDir, POCOCK_SKILL_NAMES)
    : [];

  return {
    removedClaudeMdBlock,
    removedFirewallEntries: firewallEntries.length,
    removedSkeleton: removeSkeleton,
    removedClaudeSkills,
    removedAstHook,
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
