import { stat } from 'node:fs/promises';
import {
  resolvePaths,
  resolveOpenCodePaths,
  type PraxisPaths,
  type OpenCodePaths,
} from './paths.js';

/** Harnesses praxis can install its overlay into. */
export type AgentId = 'claude-code' | 'opencode';

export const AGENT_IDS: AgentId[] = ['claude-code', 'opencode'];

/** What the user typed for `--agent`. `auto` means "whatever is installed". */
export type AgentSelector = AgentId | 'both' | 'auto';

export function parseAgentSelector(raw: string | undefined): AgentSelector {
  const value = (raw ?? 'auto').trim().toLowerCase();
  switch (value) {
    case 'auto':
    case 'both':
    case 'claude-code':
    case 'opencode':
      return value;
    case 'claude':
      return 'claude-code';
    case 'oc':
      return 'opencode';
    default:
      throw new Error(
        `Unknown --agent "${raw}". Expected one of: auto, both, claude-code, opencode.`,
      );
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export interface ResolveAgentsOptions {
  paths?: PraxisPaths;
  opencodePaths?: OpenCodePaths;
}

/**
 * Turn a selector into the concrete agent list to operate on.
 *
 * `auto` installs into every harness that is actually initialised on the
 * machine — a dual-harness user gets both without repeating the command, and
 * a Claude-Code-only user sees exactly the behaviour praxis always had.
 * `both` is the explicit form: it does not check, it just targets both.
 */
export async function resolveAgents(
  selector: AgentSelector,
  opts: ResolveAgentsOptions = {},
): Promise<AgentId[]> {
  if (selector === 'claude-code' || selector === 'opencode') return [selector];
  if (selector === 'both') return [...AGENT_IDS];

  const paths = opts.paths ?? resolvePaths();
  const opencodePaths = opts.opencodePaths ?? resolveOpenCodePaths(paths.home);
  const found: AgentId[] = [];
  if (await pathExists(paths.claudeDir)) found.push('claude-code');
  if (await pathExists(opencodePaths.opencodeDir)) found.push('opencode');
  // Nothing detected: keep claude-code so the caller produces the existing
  // "Claude Code is not initialised" error instead of silently doing nothing.
  return found.length > 0 ? found : ['claude-code'];
}
