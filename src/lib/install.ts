import { mkdir } from 'node:fs/promises';
import {
  resolvePaths,
  resolveOpenCodePaths,
  type PraxisPaths,
  type OpenCodePaths,
} from './paths.js';
import { resolveAgents, type AgentId, type AgentSelector } from './agents.js';
import {
  runOpenCodeInstall,
  runOpenCodeUninstall,
  type OpenCodeInstallResult,
  type OpenCodeUninstallResult,
} from './opencode/install.js';
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
import {
  recordOwnership,
  readOwnership,
  clearOwnership,
  claudeEntriesToRemove,
} from './ownership.js';
import { POCOCK_SKILL_NAMES } from '../data/pocock-skills.js';
import {
  bootstrapGentleAi,
  type GentleAiBootstrapOptions,
  type GentleAiBootstrapResult,
} from './gentle-ai-bootstrap.js';
import { checkDependencies, formatMissingDependencies, type DepProbe } from './dependency-check.js';

export interface InstallOptions {
  paths?: PraxisPaths;
  opencodePaths?: OpenCodePaths;
  /**
   * Which harnesses to install into. Defaults to `auto`: every harness
   * initialised on this machine.
   */
  agents?: AgentSelector;
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
  /** Harnesses this run actually touched. */
  agents: AgentId[];
  backupPath: string | null;
  skeletonInstalled: string[];
  skeletonSkipped: string[];
  claudeSkillsInstalled: string[];
  claudeSkillsSkipped: string[];
  firewallEntriesAdded: number;
  claudeMdPatched: boolean;
  astHookRegistered: boolean;
  /** Present only when OpenCode was one of the targets. */
  opencode: OpenCodeInstallResult | null;
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
  const opencodePaths = opts.opencodePaths ?? resolveOpenCodePaths(paths.home);
  const agents = await resolveAgents(opts.agents ?? 'auto', { paths, opencodePaths });
  const templatesRoot = opts.templatesRoot ?? DEFAULT_TEMPLATES_ROOT;
  const claudeSkillsTemplatesRoot =
    opts.claudeSkillsTemplatesRoot ?? DEFAULT_CLAUDE_SKILLS_TEMPLATES_ROOT;
  const firewallEntries = opts.firewallEntries ?? FIREWALL_DEFAULTS;
  const importPath = opts.importPath ?? PRAXIS_IMPORT_PATH;
  const dryRun = opts.dryRun ?? false;
  const wantsClaudeCode = agents.includes('claude-code');
  const wantsOpenCode = agents.includes('opencode');

  let report = await detect(paths);
  let mode = installModeFor(report);
  const warnings: string[] = [];

  if (wantsClaudeCode && mode === 'no-claude-code') {
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
      agents,
      backupPath: null,
      skeletonInstalled: [],
      skeletonSkipped: [],
      claudeSkillsInstalled: [],
      claudeSkillsSkipped: [],
      firewallEntriesAdded: 0,
      claudeMdPatched: false,
      astHookRegistered: false,
      opencode: null,
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
  const backupTargets = [paths.claudeMd, paths.settingsJson];
  if (wantsOpenCode) {
    // opencode.json is shared with gentle-ai, so it must be recoverable by
    // `praxis rollback` exactly like settings.json is.
    backupTargets.push(opencodePaths.opencodeJson, opencodePaths.opencodeJsonc);
  }
  const backupPath = await createBackup(backupTargets, {
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

  const claudeSkills = wantsClaudeCode
    ? await installClaudeSkills({
        templatesRoot: claudeSkillsTemplatesRoot,
        claudeSkillsDir: paths.claudeSkillsDir,
        skills: POCOCK_SKILL_NAMES,
        overwrite: opts.force,
      })
    : { installed: [], skipped: [] };

  let claudeEntriesAdded: string[] = [];
  if (wantsClaudeCode) {
    await patchClaudeMd(paths.claudeMd, importPath);
    claudeEntriesAdded = await patchSettings(paths.settingsJson, firewallEntries);

    const astHookCommand = opts.astHookCommand ?? (await resolveAstHookCommand());
    const settingsBeforeHook = await readSettings(paths.settingsJson);
    const settingsWithHook = addPraxisAstHook(settingsBeforeHook, astHookCommand);
    await writeSettings(paths.settingsJson, settingsWithHook);
  }

  let opencode: OpenCodeInstallResult | null = null;
  if (wantsOpenCode) {
    opencode = await runOpenCodeInstall({
      paths: opencodePaths,
      firewallEntries,
      skillsTemplatesRoot: claudeSkillsTemplatesRoot,
      force: opts.force,
    });
    warnings.push(...opencode.warnings);
  }

  // Record only what this machine actually gained, so uninstall can give
  // back exactly that and nothing a neighbour had already put in place.
  await recordOwnership(paths.praxisDir, {
    claudeCode: claudeEntriesAdded,
    opencode: opencode?.rulesAdded ?? [],
  });

  return {
    mode,
    agents,
    backupPath,
    skeletonInstalled: skeleton.installed,
    skeletonSkipped: skeleton.skipped,
    claudeSkillsInstalled: claudeSkills.installed,
    claudeSkillsSkipped: claudeSkills.skipped,
    firewallEntriesAdded: claudeEntriesAdded.length,
    claudeMdPatched: wantsClaudeCode,
    astHookRegistered: wantsClaudeCode,
    opencode,
    gentleAiBootstrap,
    warnings,
  };
}

export interface UninstallOptions {
  paths?: PraxisPaths;
  opencodePaths?: OpenCodePaths;
  agents?: AgentSelector;
  firewallEntries?: string[];
  removeSkeleton?: boolean;
  removeClaudeSkills?: boolean;
  keepBackup?: boolean;
}

export interface UninstallResult {
  agents: AgentId[];
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
  /** Present only when OpenCode was one of the targets. */
  opencode: OpenCodeUninstallResult | null;
  restoredFromBackup: string | null;
}

export async function runUninstall(opts: UninstallOptions = {}): Promise<UninstallResult> {
  const paths = opts.paths ?? resolvePaths();
  const opencodePaths = opts.opencodePaths ?? resolveOpenCodePaths(paths.home);
  const agents = await resolveAgents(opts.agents ?? 'auto', { paths, opencodePaths });
  const firewallEntries = opts.firewallEntries ?? FIREWALL_DEFAULTS;
  const removeSkeleton = opts.removeSkeleton ?? true;
  const removeClaudeSkillsFlag = opts.removeClaudeSkills ?? true;
  const wantsClaudeCode = agents.includes('claude-code');

  const ledger = await readOwnership(paths.praxisDir);

  let removedClaudeMdBlock = false;
  let removedAstHook = false;
  if (wantsClaudeCode) {
    removedClaudeMdBlock = await unpatchClaudeMd(paths.claudeMd);
    await unpatchSettings(paths.settingsJson, claudeEntriesToRemove(ledger, firewallEntries));

    // Remove the praxis AST hook entry from settings.json.
    const settingsBeforeHook = await readSettings(paths.settingsJson);
    const settingsWithoutHook = removePraxisAstHook(settingsBeforeHook);
    removedAstHook =
      JSON.stringify(settingsBeforeHook.hooks ?? {}) !==
      JSON.stringify(settingsWithoutHook.hooks ?? {});
    await writeSettings(paths.settingsJson, settingsWithoutHook);
  }

  const opencode = agents.includes('opencode')
    ? await runOpenCodeUninstall({
        paths: opencodePaths,
        firewallEntries,
        removeSkills: removeClaudeSkillsFlag,
        ledger,
      })
    : null;

  // The ledger describes rules that are now gone, so it goes before the
  // skeleton does — leaving it behind would make a later uninstall believe
  // it still owns them.
  await clearOwnership(paths.praxisDir);

  if (removeSkeleton) {
    await uninstallSkeleton(paths.praxisDir);
  }

  const removedClaudeSkills =
    removeClaudeSkillsFlag && wantsClaudeCode
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
    agents,
    removedClaudeMdBlock,
    removedFirewallEntries: wantsClaudeCode ? firewallEntries.length : 0,
    removedSkeleton: removeSkeleton,
    praxisDirFullyRemoved,
    removedClaudeSkills,
    removedAstHook,
    opencode,
    restoredFromBackup: null,
  };
}

/**
 * Backup basename → where it is restored to. One definition so `rollback`
 * and `rollback --to` can never drift apart; files absent from a given
 * backup are skipped by the restore.
 */
export function rollbackDestinations(
  paths: PraxisPaths,
  opencodePaths: OpenCodePaths = resolveOpenCodePaths(paths.home),
): Record<string, string> {
  return {
    'CLAUDE.md': paths.claudeMd,
    'settings.json': paths.settingsJson,
    'opencode.json': opencodePaths.opencodeJson,
    'opencode.jsonc': opencodePaths.opencodeJsonc,
  };
}

export async function runRollback(
  opts: { paths?: PraxisPaths; opencodePaths?: OpenCodePaths } = {},
): Promise<string | null> {
  const paths = opts.paths ?? resolvePaths();
  const opencodePaths = opts.opencodePaths ?? resolveOpenCodePaths(paths.home);
  return await restoreLatestBackup(rollbackDestinations(paths, opencodePaths), {
    backupsDir: paths.backupsDir,
  });
}
