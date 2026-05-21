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
import {
  bootstrapGentleAi,
  type GentleAiBootstrapOptions,
  type GentleAiBootstrapResult,
} from './gentle-ai-bootstrap.js';
import { checkDependencies, formatMissingDependencies, type DepProbe } from './dependency-check.js';

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
  /**
   * Plug-and-play bootstrap of gentle-ai (binary + ecosystem + strict TDD)
   * before the praxis overlay. Defaults to false in the library so tests
   * stay hermetic; the CLI flips it to true unless `--no-gentle-ai`.
   */
  bootstrapGentleAi?: boolean;
  /** Config overrides forwarded to the gentle-ai bootstrap. */
  gentleAiConfig?: Pick<
    GentleAiBootstrapOptions,
    'agents' | 'persona' | 'preset' | 'strictTdd' | 'run' | 'fetchInstallScript'
  >;
  /** Injectable PATH probe for the dependency preflight (tests). */
  depProbe?: DepProbe;
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
  gentleAiBootstrap: GentleAiBootstrapResult | null;
  warnings: string[];
}

/**
 * Default shell command for the praxis AST PreToolUse hook. Resolves to
 * the bin shim inside the installed package; users can override via
 * InstallOptions.astHookCommand.
 */
export const DEFAULT_AST_HOOK_COMMAND = 'praxis-ast-hook';

/**
 * Resolve the hook command for the current install context.
 *
 * When praxis-ai is installed via npm, the `praxis-ast-hook` bin is on
 * PATH and the bare name resolves correctly. When praxis-ai is invoked
 * from a local checkout (`node bin/praxis.js install`), the bin is NOT
 * on PATH — Claude Code would fail to spawn it. Detect the local case
 * by checking for a sibling `praxis-ast-hook.js` next to `process.argv[1]`
 * and return a `node <abs-path>` command in that case.
 */
export async function resolveAstHookCommand(): Promise<string> {
  const { stat } = await import('node:fs/promises');
  const { dirname, resolve } = await import('node:path');
  const script = process.argv[1];
  if (!script) return DEFAULT_AST_HOOK_COMMAND;
  const sibling = resolve(dirname(script), 'praxis-ast-hook.js');
  try {
    const s = await stat(sibling);
    if (s.isFile()) {
      return `node ${sibling}`;
    }
  } catch {
    // Not a local checkout; fall through to the bare command.
  }
  return DEFAULT_AST_HOOK_COMMAND;
}

export async function runInstall(opts: InstallOptions = {}): Promise<InstallResult> {
  const paths = opts.paths ?? resolvePaths();
  const templatesRoot = opts.templatesRoot ?? DEFAULT_TEMPLATES_ROOT;
  const claudeSkillsTemplatesRoot =
    opts.claudeSkillsTemplatesRoot ?? DEFAULT_CLAUDE_SKILLS_TEMPLATES_ROOT;
  const firewallEntries = opts.firewallEntries ?? FIREWALL_DEFAULTS;
  const importPath = opts.importPath ?? PRAXIS_IMPORT_PATH;
  const dryRun = opts.dryRun ?? false;

  let report = await detect(paths);
  let mode = installModeFor(report);
  const warnings: string[] = [];

  if (mode === 'no-claude-code') {
    throw new Error(
      `Claude Code config dir not found at ${paths.claudeDir}. ` +
        'Run `claude` once to initialise it, then retry praxis install.',
    );
  }

  if (dryRun) {
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
      gentleAiBootstrap: null,
      warnings,
    };
  }

  // Dependency preflight. When the gentle-ai bootstrap will run, require
  // git/curl/bash/node/npm and abort early with actionable install hints
  // if any are missing — gentle-ai itself does not install system deps.
  if (opts.bootstrapGentleAi) {
    const deps = checkDependencies({ includeBootstrap: true, probe: opts.depProbe });
    if (!deps.ok) {
      throw new Error(formatMissingDependencies(deps.missingRequired));
    }
    for (const dep of deps.missingOptional) {
      warnings.push(`optional dependency not found: ${dep.name} (${dep.hint})`);
    }
  }

  await mkdir(paths.backupsDir, { recursive: true });
  const backupPath = await createBackup([paths.claudeMd, paths.settingsJson], {
    backupsDir: paths.backupsDir,
  });

  // Plug-and-play: bootstrap gentle-ai (binary + ecosystem + strict TDD)
  // from its official source before layering the praxis overlay. Failures
  // are non-fatal — they become warnings so the overlay still installs.
  let gentleAiBootstrap: GentleAiBootstrapResult | null = null;
  if (opts.bootstrapGentleAi) {
    gentleAiBootstrap = await bootstrapGentleAi({
      ...opts.gentleAiConfig,
      force: opts.force,
      binaryPresent: report.gentleAi.binaryPresent,
      alreadyConfigured: report.gentleAi.markersFound.length > 0,
    });
    for (const w of gentleAiBootstrap.warnings) {
      warnings.push(`gentle-ai: ${w}`);
    }
    if (gentleAiBootstrap.skipped && gentleAiBootstrap.skipReason) {
      warnings.push(`gentle-ai: ${gentleAiBootstrap.skipReason}`);
    }
    // Re-detect so the reported mode reflects the freshly bootstrapped
    // gentle-ai state.
    report = await detect(paths);
    mode = installModeFor(report);
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

  const astHookCommand = opts.astHookCommand ?? (await resolveAstHookCommand());
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
    gentleAiBootstrap,
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
  /** True if praxis-home install artefacts were removed from ~/.praxis/. */
  removedSkeleton: boolean;
  /**
   * True when the whole ~/.praxis/ directory is gone after uninstall.
   * False when the directory still exists because user data (backups/,
   * telemetry.db) was preserved by uninstallSkeleton.
   */
  praxisDirFullyRemoved: boolean;
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

  // Was the whole praxis dir actually removed, or did backups/telemetry survive?
  const { stat } = await import('node:fs/promises');
  let praxisDirFullyRemoved = false;
  try {
    await stat(paths.praxisDir);
    praxisDirFullyRemoved = false;
  } catch {
    praxisDirFullyRemoved = true;
  }

  return {
    removedClaudeMdBlock,
    removedFirewallEntries: firewallEntries.length,
    removedSkeleton: removeSkeleton,
    praxisDirFullyRemoved,
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
