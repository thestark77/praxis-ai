import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveOpenCodePaths, type OpenCodePaths } from '../paths.js';
import {
  readOpenCodeConfig,
  writeOpenCodeConfig,
  resolveConfigFile,
  addPraxisInstructions,
  removePraxisInstructions,
  hasPraxisInstructions,
  type OpenCodeConfig,
} from './config.js';
import {
  translateDenyEntries,
  mergePraxisPermissions,
  removePraxisPermissions,
  countActivePraxisRules,
  type OpenCodeRule,
} from './permissions.js';
import {
  writeFirewallPlugin,
  removeFirewallPlugin,
  readPluginStatus,
  resolveFirewallModulePath,
  readPackageVersion,
  type PluginStatus,
} from './plugin.js';
import {
  installClaudeSkills,
  uninstallClaudeSkills,
  DEFAULT_CLAUDE_SKILLS_TEMPLATES_ROOT,
} from '../skeleton-installer.js';
import { FIREWALL_DEFAULTS } from '../../data/firewall-defaults.js';
import { POCOCK_SKILL_NAMES } from '../../data/pocock-skills.js';

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export interface OpenCodeDetection {
  configDirExists: boolean;
  /** The config file praxis would patch — existing one wins over the default. */
  configFile: string;
  configFileExists: boolean;
  /** Praxis rules currently enforced as `deny`, out of `totalRules`. */
  activeRules: number;
  totalRules: number;
  instructionsPresent: boolean;
  plugin: PluginStatus;
  skillsInstalled: string[];
}

export function praxisOpenCodeRules(firewallEntries: string[] = FIREWALL_DEFAULTS): OpenCodeRule[] {
  return translateDenyEntries(firewallEntries);
}

/** The overlay entry point praxis points OpenCode's `instructions` at. */
export function praxisMainMdPath(home: string): string {
  return join(home, '.praxis', 'main.md');
}

export async function detectOpenCode(
  paths: OpenCodePaths = resolveOpenCodePaths(),
  firewallEntries: string[] = FIREWALL_DEFAULTS,
): Promise<OpenCodeDetection> {
  const rules = praxisOpenCodeRules(firewallEntries);
  const configFile = await resolveConfigFile(paths);
  const configFileExists = await pathExists(configFile);

  let config: OpenCodeConfig = {};
  if (configFileExists) {
    try {
      config = await readOpenCodeConfig(configFile);
    } catch {
      // An unparseable config is reported as "no rules active" rather than
      // crashing doctor; install is where that error must surface.
      config = {};
    }
  }

  const skillsInstalled: string[] = [];
  for (const skill of POCOCK_SKILL_NAMES) {
    if (await pathExists(join(paths.skillsDir, skill, 'SKILL.md'))) skillsInstalled.push(skill);
  }

  return {
    configDirExists: await pathExists(paths.opencodeDir),
    configFile,
    configFileExists,
    activeRules: countActivePraxisRules(config.permission, rules),
    totalRules: rules.length,
    instructionsPresent: hasPraxisInstructions(config),
    plugin: await readPluginStatus(paths.firewallPlugin),
    skillsInstalled,
  };
}

export interface OpenCodeInstallOptions {
  paths?: OpenCodePaths;
  home?: string;
  firewallEntries?: string[];
  skillsTemplatesRoot?: string;
  /**
   * Override the engine the emitted plugin imports. `undefined` resolves it
   * from the installed package; `null` means "not available", the branch a
   * source checkout without a build hits.
   */
  firewallModulePath?: string | null;
  force?: boolean;
  /** Fail instead of writing when OpenCode is not initialised on this box. */
  requireExisting?: boolean;
}

export interface OpenCodeInstallResult {
  configFile: string;
  permissionRulesAdded: number;
  permissionRulesUpgraded: number;
  permissionRulesAlreadyDenied: number;
  instructionsPatched: boolean;
  pluginPath: string;
  firewallModulePath: string | null;
  skillsInstalled: string[];
  skillsSkipped: string[];
  warnings: string[];
}

/**
 * Install the praxis overlay into OpenCode.
 *
 * Three layers, mirroring the Claude Code install one for one:
 *   - `permission` denies in opencode.json  ≙ `permissions.deny`
 *   - `plugins/praxis-firewall.ts`          ≙ the PreToolUse AST hook
 *   - `instructions[]` → ~/.praxis/main.md  ≙ the CLAUDE.md @-import
 *
 * Everything merges. OpenCode's config is shared with gentle-ai (agents,
 * MCP servers, its own permission entries) and none of it may be clobbered.
 */
export async function runOpenCodeInstall(
  opts: OpenCodeInstallOptions = {},
): Promise<OpenCodeInstallResult> {
  const paths = opts.paths ?? resolveOpenCodePaths(opts.home);
  const firewallEntries = opts.firewallEntries ?? FIREWALL_DEFAULTS;
  const skillsTemplatesRoot = opts.skillsTemplatesRoot ?? DEFAULT_CLAUDE_SKILLS_TEMPLATES_ROOT;
  const warnings: string[] = [];

  if (opts.requireExisting && !(await pathExists(paths.opencodeDir))) {
    throw new Error(
      `OpenCode config dir not found at ${paths.opencodeDir}. ` +
        'Run `opencode` once to initialise it, then retry.',
    );
  }

  await mkdir(paths.opencodeDir, { recursive: true });

  const configFile = await resolveConfigFile(paths);
  const config = await readOpenCodeConfig(configFile);
  const rules = praxisOpenCodeRules(firewallEntries);

  const merged = mergePraxisPermissions(config.permission, rules);
  for (const rule of merged.upgraded) {
    warnings.push(
      `opencode: raised ${rule.tool} "${rule.pattern}" from "${rule.previous}" to "deny" ` +
        '(praxis hard-denies irreversible actions; `praxis rollback` restores the previous config)',
    );
  }

  const mainMd = praxisMainMdPath(paths.home);
  const withInstructions = addPraxisInstructions(
    { ...config, permission: merged.permissions },
    mainMd,
  );
  await writeOpenCodeConfig(configFile, withInstructions);

  const firewallModulePath =
    opts.firewallModulePath === undefined
      ? await resolveFirewallModulePath()
      : opts.firewallModulePath;
  let pluginPath = paths.firewallPlugin;
  if (firewallModulePath) {
    const version = await readPackageVersion();
    const written = await writeFirewallPlugin(paths.firewallPlugin, {
      firewallModulePath,
      version,
    });
    pluginPath = written.path;
  } else {
    warnings.push(
      'opencode: built firewall engine (dist/firewall.js) not found, so the AST plugin was ' +
        'not emitted. Run `npm run build` in the praxis checkout, or reinstall praxis-ai from ' +
        'npm, then re-run install. Layer 1 (permission denies) is active.',
    );
  }

  const skills = await installClaudeSkills({
    templatesRoot: skillsTemplatesRoot,
    claudeSkillsDir: paths.skillsDir,
    skills: POCOCK_SKILL_NAMES,
    overwrite: opts.force,
  });

  return {
    configFile,
    permissionRulesAdded: merged.added.length,
    permissionRulesUpgraded: merged.upgraded.length,
    permissionRulesAlreadyDenied: merged.unchanged.length,
    instructionsPatched: true,
    pluginPath,
    firewallModulePath,
    skillsInstalled: skills.installed,
    skillsSkipped: skills.skipped,
    warnings,
  };
}

export interface OpenCodeUninstallOptions {
  paths?: OpenCodePaths;
  home?: string;
  firewallEntries?: string[];
  removeSkills?: boolean;
}

export interface OpenCodeUninstallResult {
  configFile: string;
  permissionRulesRemoved: number;
  instructionsRemoved: boolean;
  pluginRemoved: boolean;
  skillsRemoved: string[];
}

export async function runOpenCodeUninstall(
  opts: OpenCodeUninstallOptions = {},
): Promise<OpenCodeUninstallResult> {
  const paths = opts.paths ?? resolveOpenCodePaths(opts.home);
  const firewallEntries = opts.firewallEntries ?? FIREWALL_DEFAULTS;
  const removeSkills = opts.removeSkills ?? true;

  const configFile = await resolveConfigFile(paths);
  const configExists = await pathExists(configFile);

  let permissionRulesRemoved = 0;
  let instructionsRemoved = false;
  if (configExists) {
    const config = await readOpenCodeConfig(configFile);
    const rules = praxisOpenCodeRules(firewallEntries);
    const stripped = removePraxisPermissions(config.permission, rules);
    permissionRulesRemoved = stripped.removed.length;
    const next: OpenCodeConfig = { ...config };
    if (Object.keys(stripped.permissions).length === 0) {
      delete next.permission;
    } else {
      next.permission = stripped.permissions;
    }
    const withoutInstructions = removePraxisInstructions(next);
    instructionsRemoved = withoutInstructions.removed;
    await writeOpenCodeConfig(configFile, withoutInstructions.config);
  }

  const pluginRemoved = await removeFirewallPlugin(paths.firewallPlugin);
  const skillsRemoved = removeSkills
    ? await uninstallClaudeSkills(paths.skillsDir, POCOCK_SKILL_NAMES)
    : [];

  return {
    configFile,
    permissionRulesRemoved,
    instructionsRemoved,
    pluginRemoved,
    skillsRemoved,
  };
}
