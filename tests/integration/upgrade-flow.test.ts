import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInstall, runUninstall } from '../../src/lib/install.js';
import { resolvePaths } from '../../src/lib/paths.js';
import { readSettings } from '../../src/lib/settings-patcher.js';
import { readOwnership, clearOwnership } from '../../src/lib/ownership.js';

// Driving whole installs, not the units underneath them, is the only way
// these showed up: each piece behaved correctly on its own and the
// composition still stranded the firewall.

// Under vitest the default template roots resolve next to the source
// file, not the package root, so they are passed explicitly.
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const templatesRoot = join(repoRoot, 'templates', 'praxis-home');
const claudeSkillsTemplatesRoot = join(repoRoot, 'templates', 'claude-skills');

const savedPraxisHome = process.env.PRAXIS_HOME;
afterEach(() => {
  if (savedPraxisHome === undefined) delete process.env.PRAXIS_HOME;
  else process.env.PRAXIS_HOME = savedPraxisHome;
});

async function box(preExistingDenies: string[] = []): Promise<ReturnType<typeof resolvePaths>> {
  const home = await mkdtemp(join(tmpdir(), 'praxis-upgrade-'));
  process.env.PRAXIS_HOME = home;
  const paths = resolvePaths(home);
  await mkdir(paths.claudeDir, { recursive: true });
  await writeFile(paths.claudeMd, '# my notes\nkeep me\n', 'utf8');
  await writeFile(
    paths.settingsJson,
    JSON.stringify({ permissions: { deny: preExistingDenies } }, null, 2),
    'utf8',
  );
  return paths;
}

const install = (paths: ReturnType<typeof resolvePaths>) =>
  runInstall({
    paths,
    agents: 'claude-code',
    bootstrapGentleAi: false,
    templatesRoot,
    claudeSkillsTemplatesRoot,
  });
const uninstall = (paths: ReturnType<typeof resolvePaths>) =>
  runUninstall({ paths, agents: 'claude-code' });

async function denies(paths: ReturnType<typeof resolvePaths>): Promise<string[]> {
  return (await readSettings(paths.settingsJson)).permissions?.deny ?? [];
}

describe('a clean install, then uninstall', () => {
  it('puts every rule in and takes every rule back out', async () => {
    const paths = await box();
    const installed = await install(paths);
    expect(installed.firewallEntriesAdded).toBeGreaterThan(0);
    expect(await denies(paths)).toHaveLength(installed.firewallEntriesAdded);

    const removed = await uninstall(paths);
    expect(removed.removedFirewallEntries).toBe(installed.firewallEntriesAdded);
    expect(removed.preservedFirewallEntries).toBe(0);
    expect(await denies(paths)).toEqual([]);
  });

  it('is idempotent: installing twice adds nothing the second time', async () => {
    const paths = await box();
    const first = await install(paths);
    const second = await install(paths);
    expect(second.firewallEntriesAdded).toBe(0);
    expect(await denies(paths)).toHaveLength(first.firewallEntriesAdded);
  });
});

describe('a box that already protects itself', () => {
  const mine = ['Read(.env)', 'Bash(git push --force*)', 'Bash(mycompany-deploy *)'];

  it('does not claim rules it found already in place', async () => {
    const paths = await box(mine);
    const result = await install(paths);
    const ledger = await readOwnership(paths.praxisDir);
    expect(ledger?.claudeCode).not.toContain('Read(.env)');
    expect(ledger?.claudeCode).not.toContain('Bash(git push --force*)');
    expect(ledger?.claudeCode).toHaveLength(result.firewallEntriesAdded);
  });

  it('leaves them behind on uninstall, and says so', async () => {
    const paths = await box(mine);
    await install(paths);
    const removed = await uninstall(paths);
    expect(removed.preservedFirewallEntries).toBe(2);
    expect(await denies(paths)).toEqual(mine);
  });
});

describe('upgrading from a version that kept no ledger', () => {
  // The pre-ledger install is reproduced exactly: praxis is fully
  // installed and the ledger simply does not exist.
  async function preLedgerBox(): Promise<ReturnType<typeof resolvePaths>> {
    const paths = await box();
    await install(paths);
    await clearOwnership(paths.praxisDir);
    return paths;
  }

  it('marks the ledger it inherits as incomplete', async () => {
    const paths = await preLedgerBox();
    await install(paths);
    const ledger = await readOwnership(paths.praxisDir);
    // The upgrade sees every rule as already present and can claim none.
    expect(ledger?.claudeCode).toHaveLength(0);
    expect(ledger?.inheritedPreLedgerInstall).toBe(true);
  });

  it('still uninstalls completely, stranding nothing', async () => {
    const paths = await preLedgerBox();
    await install(paths);
    const removed = await uninstall(paths);
    expect(removed.removedFirewallEntries).toBeGreaterThan(0);
    expect(await denies(paths)).toEqual([]);
  });

  it('keeps the mark across further upgrades', async () => {
    const paths = await preLedgerBox();
    await install(paths);
    await install(paths);
    expect((await readOwnership(paths.praxisDir))?.inheritedPreLedgerInstall).toBe(true);
    const removed = await uninstall(paths);
    expect(removed.removedFirewallEntries).toBeGreaterThan(0);
  });

  it('recovers a precise ledger after a clean uninstall and reinstall', async () => {
    const paths = await preLedgerBox();
    await install(paths);
    await uninstall(paths);
    const fresh = await install(paths);
    const ledger = await readOwnership(paths.praxisDir);
    expect(ledger?.inheritedPreLedgerInstall).toBe(false);
    expect(ledger?.claudeCode).toHaveLength(fresh.firewallEntriesAdded);
  });
});
