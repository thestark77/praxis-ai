import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOpenCodePaths, type OpenCodePaths } from '../../../src/lib/paths.js';
import {
  runOpenCodeInstall,
  runOpenCodeUninstall,
  detectOpenCode,
  praxisOpenCodeRules,
} from '../../../src/lib/opencode/install.js';
import { readOpenCodeConfig } from '../../../src/lib/opencode/config.js';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const skillsTemplatesRoot = join(repoRoot, 'templates', 'claude-skills');
const engine = join(repoRoot, 'dist', 'firewall.js');

/**
 * A gentle-ai-shaped OpenCode config: agents, MCP servers and a permission
 * block of its own. Everything praxis does has to survive contact with it.
 */
const savedPraxisHome = process.env.PRAXIS_HOME;

afterEach(() => {
  if (savedPraxisHome === undefined) delete process.env.PRAXIS_HOME;
  else process.env.PRAXIS_HOME = savedPraxisHome;
});

const GENTLE_AI_CONFIG = {
  $schema: 'https://opencode.ai/config.json',
  agent: {
    gentleman: { mode: 'primary', prompt: '{file:./AGENTS.md}' },
  },
  mcp: { engram: { type: 'local', command: ['engram', 'serve'] } },
  permission: {
    bash: { '*': 'allow', 'git commit *': 'ask', 'git push --force *': 'ask' },
    read: { '*': 'allow', '**/.env': 'deny' },
  },
};

async function sandbox(withConfig = true): Promise<OpenCodePaths> {
  const home = await mkdtemp(join(tmpdir(), 'praxis-oc-install-'));
  // Pin the sandbox: with PRAXIS_HOME set, resolveOpenCodeDir ignores an
  // ambient XDG_CONFIG_HOME, so each test gets its own config dir instead
  // of all of them writing to the developer's real one.
  process.env.PRAXIS_HOME = home;
  const paths = resolveOpenCodePaths(home);
  await mkdir(paths.opencodeDir, { recursive: true });
  if (withConfig) {
    await writeFile(paths.opencodeJson, JSON.stringify(GENTLE_AI_CONFIG, null, 2), 'utf8');
  }
  return paths;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('runOpenCodeInstall', () => {
  it('installs all three layers into an existing gentle-ai config', async () => {
    const paths = await sandbox();
    const result = await runOpenCodeInstall({
      paths,
      skillsTemplatesRoot,
      firewallModulePath: engine,
    });

    const config = await readOpenCodeConfig(paths.opencodeJson);
    const bash = config.permission?.bash as Record<string, string>;
    const read = config.permission?.read as Record<string, string>;

    // Layer 1: permission denies.
    expect(bash['rm -rf *']).toBe('deny');
    expect(read['**/*.pem']).toBe('deny');
    expect(result.permissionRulesAdded).toBeGreaterThan(0);

    // Layer 2: the AST plugin.
    expect(await exists(paths.firewallPlugin)).toBe(true);
    expect(await readFile(paths.firewallPlugin, 'utf8')).toContain('tool.execute.before');

    // Layer 3: the overlay pointer.
    expect(config.instructions).toContain(join(paths.home, '.praxis', 'main.md'));

    // Skills.
    expect(result.skillsInstalled.length).toBeGreaterThan(0);
    expect(await exists(join(paths.skillsDir, 'grill-with-docs', 'SKILL.md'))).toBe(true);
  });

  it('never clobbers gentle-ai agents, mcp servers or foreign permissions', async () => {
    const paths = await sandbox();
    await runOpenCodeInstall({ paths, skillsTemplatesRoot, firewallModulePath: engine });
    const config = await readOpenCodeConfig(paths.opencodeJson);
    expect(config.agent).toEqual(GENTLE_AI_CONFIG.agent);
    expect(config.mcp).toEqual(GENTLE_AI_CONFIG.mcp);
    const bash = config.permission?.bash as Record<string, string>;
    expect(bash['*']).toBe('allow');
    expect(bash['git commit *']).toBe('ask');
  });

  it('raises a weaker gentle-ai rule to deny and warns about it', async () => {
    const paths = await sandbox();
    const result = await runOpenCodeInstall({
      paths,
      skillsTemplatesRoot,
      firewallModulePath: engine,
      firewallEntries: ['Bash(git push --force *)'],
    });
    const config = await readOpenCodeConfig(paths.opencodeJson);
    expect((config.permission?.bash as Record<string, string>)['git push --force *']).toBe('deny');
    expect(result.permissionRulesUpgraded).toBe(1);
    expect(result.warnings.join('\n')).toMatch(/raised bash .*ask.* to "deny"/);
  });

  it('is idempotent: a second install adds nothing new', async () => {
    const paths = await sandbox();
    await runOpenCodeInstall({ paths, skillsTemplatesRoot, firewallModulePath: engine });
    const first = await readFile(paths.opencodeJson, 'utf8');
    const second = await runOpenCodeInstall({
      paths,
      skillsTemplatesRoot,
      firewallModulePath: engine,
    });
    expect(await readFile(paths.opencodeJson, 'utf8')).toBe(first);
    expect(second.permissionRulesAdded).toBe(0);
    expect(second.permissionRulesUpgraded).toBe(0);
  });

  it('bootstraps a config from nothing when OpenCode has none yet', async () => {
    const paths = await sandbox(false);
    await runOpenCodeInstall({ paths, skillsTemplatesRoot, firewallModulePath: engine });
    const config = await readOpenCodeConfig(paths.opencodeJson);
    expect(config.$schema).toBe('https://opencode.ai/config.json');
    expect((config.permission?.bash as Record<string, string>)['rm -rf *']).toBe('deny');
  });

  it('keeps layer 1 and warns when the engine is not built', async () => {
    const paths = await sandbox();
    const result = await runOpenCodeInstall({
      paths,
      skillsTemplatesRoot,
      firewallModulePath: null,
    });
    expect(await exists(paths.firewallPlugin)).toBe(false);
    expect(result.warnings.join('\n')).toMatch(/dist\/firewall\.js.*not found/);
    // The permission denies still land: a missing layer 2 must not take
    // layer 1 down with it.
    const config = await readOpenCodeConfig(paths.opencodeJson);
    expect((config.permission?.bash as Record<string, string>)['rm -rf *']).toBe('deny');
  });

  it('refuses to write when OpenCode is not initialised and requireExisting is set', async () => {
    const home = await mkdtemp(join(tmpdir(), 'praxis-oc-missing-'));
    const paths = resolveOpenCodePaths(home);
    await expect(
      runOpenCodeInstall({ paths, skillsTemplatesRoot, requireExisting: true }),
    ).rejects.toThrow(/OpenCode config dir not found/);
  });
});

describe('runOpenCodeUninstall', () => {
  it('restores the config to what gentle-ai had before praxis', async () => {
    const paths = await sandbox();
    const before = JSON.parse(await readFile(paths.opencodeJson, 'utf8')) as unknown;
    await runOpenCodeInstall({ paths, skillsTemplatesRoot, firewallModulePath: engine });
    const result = await runOpenCodeUninstall({ paths });

    const after = JSON.parse(await readFile(paths.opencodeJson, 'utf8')) as Record<string, unknown>;
    expect(after.agent).toEqual((before as Record<string, unknown>).agent);
    expect(after.mcp).toEqual((before as Record<string, unknown>).mcp);
    expect(after.instructions).toBeUndefined();
    expect(result.instructionsRemoved).toBe(true);
    expect(result.pluginRemoved).toBe(true);
    expect(await exists(paths.firewallPlugin)).toBe(false);
    expect(result.skillsRemoved.length).toBeGreaterThan(0);
  });

  it('leaves a rule praxis had raised at deny, recoverable via rollback', async () => {
    // Documented consequence: uninstall removes praxis denies, and a rule it
    // raised from `ask` disappears rather than reverting. `praxis rollback`
    // is the exact-restore path, which is why opencode.json is backed up.
    const paths = await sandbox();
    await runOpenCodeInstall({
      paths,
      skillsTemplatesRoot,
      firewallModulePath: engine,
      firewallEntries: ['Bash(git push --force *)'],
    });
    await runOpenCodeUninstall({ paths, firewallEntries: ['Bash(git push --force *)'] });
    const config = await readOpenCodeConfig(paths.opencodeJson);
    expect(
      (config.permission?.bash as Record<string, string>)['git push --force *'],
    ).toBeUndefined();
    expect((config.permission?.bash as Record<string, string>)['git commit *']).toBe('ask');
  });

  it('is safe to run when praxis was never installed', async () => {
    const paths = await sandbox();
    const result = await runOpenCodeUninstall({ paths });
    expect(result.permissionRulesRemoved).toBe(0);
    expect(result.pluginRemoved).toBe(false);
  });
});

describe('detectOpenCode', () => {
  it('reports a clean box as fully uninstalled', async () => {
    const paths = await sandbox();
    const report = await detectOpenCode(paths);
    expect(report.configDirExists).toBe(true);
    expect(report.activeRules).toBe(0);
    expect(report.instructionsPresent).toBe(false);
    expect(report.plugin.present).toBe(false);
  });

  it('reports every praxis rule active after an install', async () => {
    const paths = await sandbox();
    await runOpenCodeInstall({ paths, skillsTemplatesRoot, firewallModulePath: engine });
    const report = await detectOpenCode(paths);
    expect(report.totalRules).toBe(praxisOpenCodeRules().length);
    expect(report.activeRules).toBe(report.totalRules);
    expect(report.instructionsPresent).toBe(true);
    expect(report.plugin.present).toBe(true);
    expect(report.plugin.engineResolvable).toBe(true);
    expect(report.skillsInstalled.length).toBeGreaterThan(0);
  });
});
