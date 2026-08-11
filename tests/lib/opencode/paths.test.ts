import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { resolveOpenCodeDir, resolveOpenCodePaths } from '../../../src/lib/paths.js';

const savedPraxisHome = process.env.PRAXIS_HOME;
const savedXdg = process.env.XDG_CONFIG_HOME;

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('PRAXIS_HOME', savedPraxisHome);
  restore('XDG_CONFIG_HOME', savedXdg);
});

describe('resolveOpenCodeDir', () => {
  it('defaults to <home>/.config/opencode on every platform', () => {
    delete process.env.PRAXIS_HOME;
    delete process.env.XDG_CONFIG_HOME;
    expect(resolveOpenCodeDir('/home/tester')).toBe(join('/home/tester', '.config', 'opencode'));
  });

  it('honours XDG_CONFIG_HOME when praxis is not sandboxed', () => {
    delete process.env.PRAXIS_HOME;
    process.env.XDG_CONFIG_HOME = join('/tmp', 'xdg');
    expect(resolveOpenCodeDir('/home/tester')).toBe(join('/tmp', 'xdg', 'opencode'));
  });

  it('ignores XDG_CONFIG_HOME while PRAXIS_HOME sandboxes the run', () => {
    // Regression guard of the same class as the Windows HOME bug: a test
    // (or a user) that sandboxes the home must never have the ambient
    // XDG_CONFIG_HOME pull writes back into the real OpenCode config.
    process.env.PRAXIS_HOME = join('/tmp', 'sandbox');
    process.env.XDG_CONFIG_HOME = join('/tmp', 'xdg');
    expect(resolveOpenCodeDir(join('/tmp', 'sandbox'))).toBe(
      join('/tmp', 'sandbox', '.config', 'opencode'),
    );
  });
});

describe('resolveOpenCodePaths', () => {
  it('places every artefact inside the resolved config dir', () => {
    delete process.env.PRAXIS_HOME;
    delete process.env.XDG_CONFIG_HOME;
    const paths = resolveOpenCodePaths('/home/tester');
    const dir = join('/home/tester', '.config', 'opencode');
    expect(paths.opencodeDir).toBe(dir);
    expect(paths.opencodeJson).toBe(join(dir, 'opencode.json'));
    expect(paths.opencodeJsonc).toBe(join(dir, 'opencode.jsonc'));
    expect(paths.pluginsDir).toBe(join(dir, 'plugins'));
    expect(paths.firewallPlugin).toBe(join(dir, 'plugins', 'praxis-firewall.ts'));
    expect(paths.skillsDir).toBe(join(dir, 'skills'));
    expect(paths.agentsMd).toBe(join(dir, 'AGENTS.md'));
  });
});
