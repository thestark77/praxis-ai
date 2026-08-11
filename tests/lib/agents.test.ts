import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAgentSelector, resolveAgents } from '../../src/lib/agents.js';
import { resolvePaths, resolveOpenCodePaths } from '../../src/lib/paths.js';

const savedPraxisHome = process.env.PRAXIS_HOME;

afterEach(() => {
  if (savedPraxisHome === undefined) delete process.env.PRAXIS_HOME;
  else process.env.PRAXIS_HOME = savedPraxisHome;
});

async function sandbox(opts: { claude?: boolean; opencode?: boolean }) {
  const home = await mkdtemp(join(tmpdir(), 'praxis-agents-'));
  // Pin the sandbox so an ambient XDG_CONFIG_HOME cannot pull the OpenCode
  // dir out of the temp home and make sandboxes share state.
  process.env.PRAXIS_HOME = home;
  const paths = resolvePaths(home);
  const opencodePaths = resolveOpenCodePaths(home);
  if (opts.claude) await mkdir(paths.claudeDir, { recursive: true });
  if (opts.opencode) await mkdir(opencodePaths.opencodeDir, { recursive: true });
  return { paths, opencodePaths };
}

describe('parseAgentSelector', () => {
  it('accepts the documented selectors and the obvious aliases', () => {
    expect(parseAgentSelector(undefined)).toBe('auto');
    expect(parseAgentSelector('AUTO')).toBe('auto');
    expect(parseAgentSelector('both')).toBe('both');
    expect(parseAgentSelector('claude')).toBe('claude-code');
    expect(parseAgentSelector('oc')).toBe('opencode');
  });

  it('rejects anything else with an actionable message', () => {
    expect(() => parseAgentSelector('cursor')).toThrow(/auto, both, claude-code, opencode/);
  });
});

describe('resolveAgents', () => {
  it('honours an explicit single target without probing the disk', async () => {
    const { paths, opencodePaths } = await sandbox({});
    expect(await resolveAgents('opencode', { paths, opencodePaths })).toEqual(['opencode']);
    expect(await resolveAgents('claude-code', { paths, opencodePaths })).toEqual(['claude-code']);
  });

  it('targets both harnesses when asked, present or not', async () => {
    const { paths, opencodePaths } = await sandbox({});
    expect(await resolveAgents('both', { paths, opencodePaths })).toEqual([
      'claude-code',
      'opencode',
    ]);
  });

  it('auto-detects every harness initialised on the machine', async () => {
    const dual = await sandbox({ claude: true, opencode: true });
    expect(await resolveAgents('auto', dual)).toEqual(['claude-code', 'opencode']);

    const claudeOnly = await sandbox({ claude: true });
    expect(await resolveAgents('auto', claudeOnly)).toEqual(['claude-code']);

    const opencodeOnly = await sandbox({ opencode: true });
    expect(await resolveAgents('auto', opencodeOnly)).toEqual(['opencode']);
  });

  it('falls back to claude-code when nothing is installed, so install still explains itself', async () => {
    const empty = await sandbox({});
    expect(await resolveAgents('auto', empty)).toEqual(['claude-code']);
  });
});
