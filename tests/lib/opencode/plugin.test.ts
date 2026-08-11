import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  renderFirewallPlugin,
  writeFirewallPlugin,
  removeFirewallPlugin,
  readPluginStatus,
  resolveFirewallModulePath,
  readPackageVersion,
  PRAXIS_PLUGIN_MARKER,
} from '../../../src/lib/opencode/plugin.js';

async function sandbox(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'praxis-oc-plugin-'));
}

const engine = resolve(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  '..',
  '..',
  'dist',
  'firewall.js',
);

describe('renderFirewallPlugin', () => {
  it('imports the engine by absolute file URL, not by package name', () => {
    const source = renderFirewallPlugin({ firewallModulePath: engine, version: '9.9.9' });
    expect(source).toContain(`from ${JSON.stringify(pathToFileURL(engine).href)}`);
    expect(source).not.toContain("from 'praxis-ai");
  });

  it('carries the praxis marker and version', () => {
    const source = renderFirewallPlugin({ firewallModulePath: engine, version: '9.9.9' });
    expect(source).toContain(`${PRAXIS_PLUGIN_MARKER} v9.9.9`);
  });

  it('only inspects bash and throws to block', () => {
    const source = renderFirewallPlugin({ firewallModulePath: engine, version: '9.9.9' });
    expect(source).toContain('tool.execute.before');
    expect(source).toContain('input?.tool !== "bash"');
    expect(source).toContain('throw new Error(result.reason)');
  });

  it('never imports the self-executing hook bundle', () => {
    const source = renderFirewallPlugin({ firewallModulePath: engine, version: '9.9.9' });
    expect(source).not.toContain('ast-hook.js');
  });
});

describe('writeFirewallPlugin / removeFirewallPlugin', () => {
  it('writes the plugin, creating the plugins dir', async () => {
    const dir = await sandbox();
    const pluginPath = join(dir, 'plugins', 'praxis-firewall.ts');
    await writeFirewallPlugin(pluginPath, { firewallModulePath: engine, version: '1.2.3' });
    expect(await readFile(pluginPath, 'utf8')).toContain(PRAXIS_PLUGIN_MARKER);
  });

  it('removes only a praxis-generated plugin', async () => {
    const dir = await sandbox();
    const pluginPath = join(dir, 'plugins', 'praxis-firewall.ts');
    await mkdir(join(dir, 'plugins'), { recursive: true });
    await writeFile(pluginPath, '// hand written, not praxis\n', 'utf8');
    expect(await removeFirewallPlugin(pluginPath)).toBe(false);
    expect(await readFile(pluginPath, 'utf8')).toContain('hand written');

    await writeFirewallPlugin(pluginPath, { firewallModulePath: engine, version: '1.2.3' });
    expect(await removeFirewallPlugin(pluginPath)).toBe(true);
    expect(await removeFirewallPlugin(pluginPath)).toBe(false);
  });
});

describe('readPluginStatus', () => {
  it('reports the engine URL and that it resolves', async () => {
    const dir = await sandbox();
    const pluginPath = join(dir, 'plugins', 'praxis-firewall.ts');
    await writeFirewallPlugin(pluginPath, { firewallModulePath: engine, version: '1.2.3' });
    const status = await readPluginStatus(pluginPath);
    expect(status.present).toBe(true);
    expect(status.version).toBe('1.2.3');
    expect(status.engineUrl).toBe(pathToFileURL(engine).href);
    expect(status.engineResolvable).toBe(true);
  });

  it('flags a plugin whose engine import no longer exists', async () => {
    const dir = await sandbox();
    const pluginPath = join(dir, 'plugins', 'praxis-firewall.ts');
    await writeFirewallPlugin(pluginPath, {
      firewallModulePath: join(dir, 'gone', 'firewall.js'),
      version: '1.2.3',
    });
    const status = await readPluginStatus(pluginPath);
    expect(status.present).toBe(true);
    expect(status.engineResolvable).toBe(false);
  });

  it('reports absent for a missing or foreign file', async () => {
    const dir = await sandbox();
    expect((await readPluginStatus(join(dir, 'nope.ts'))).present).toBe(false);
    const foreign = join(dir, 'praxis-firewall.ts');
    await writeFile(foreign, 'export const X = 1\n', 'utf8');
    expect((await readPluginStatus(foreign)).present).toBe(false);
  });
});

describe('resolveFirewallModulePath', () => {
  it('finds the built engine from a source checkout', async () => {
    // `npm test` builds first, so dist/firewall.js is on disk here.
    expect(await resolveFirewallModulePath()).toBe(engine);
  });
});

describe('readPackageVersion', () => {
  it('finds praxis-ai own version rather than falling back', async () => {
    // Regression guard: the bundled layout (`<pkg>/dist/index.js`) was not
    // in the candidate list, so real installs stamped the plugin `v0.0.0`.
    const pkg = JSON.parse(
      await readFile(
        resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'package.json'),
        'utf8',
      ),
    ) as { version: string };
    expect(await readPackageVersion()).toBe(pkg.version);
  });
});

describe('the engine the plugin imports', () => {
  it('denies an irreversible command and allows a safe one', async () => {
    const mod = (await import(pathToFileURL(engine).href)) as {
      inspectBashCommand: (cmd: string) => { decision: string; reason: string };
    };
    expect(mod.inspectBashCommand('rm -rf /tmp/whatever').decision).toBe('deny');
    expect(mod.inspectBashCommand('ls -la').decision).toBe('allow');
  });

  it('catches the chained bypass a glob deny list misses', async () => {
    const mod = (await import(pathToFileURL(engine).href)) as {
      inspectBashCommand: (cmd: string) => { decision: string };
    };
    expect(mod.inspectBashCommand('echo hi && rm -rf /tmp/whatever').decision).toBe('deny');
  });
});
