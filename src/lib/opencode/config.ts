import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { OpenCodePermissions } from './permissions.js';

export const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json';

export interface OpenCodeConfig {
  $schema?: string;
  permission?: OpenCodePermissions;
  instructions?: string[];
  [key: string]: unknown;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick the config file praxis should patch.
 *
 * OpenCode accepts both `opencode.json` and `opencode.jsonc`. When a `.jsonc`
 * is the live config, patching the `.json` sibling would write rules OpenCode
 * never reads — a silently disarmed firewall — so the existing file always
 * wins and `.json` is only chosen when neither exists.
 */
export async function resolveConfigFile(paths: {
  opencodeJson: string;
  opencodeJsonc: string;
}): Promise<string> {
  if (await pathExists(paths.opencodeJson)) return paths.opencodeJson;
  if (await pathExists(paths.opencodeJsonc)) return paths.opencodeJsonc;
  return paths.opencodeJson;
}

/**
 * Read an OpenCode config. A missing file is an empty config; a malformed
 * one throws with the path, because guessing would mean overwriting a config
 * praxis could not understand.
 */
export async function readOpenCodeConfig(path: string): Promise<OpenCodeConfig> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  try {
    return JSON.parse(content) as OpenCodeConfig;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${path} is not valid JSON (${message}). ` +
        'praxis will not rewrite a config it cannot parse — fix or move the file and retry. ' +
        'JSONC comments are not supported.',
    );
  }
}

export async function writeOpenCodeConfig(path: string, config: OpenCodeConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const withSchema: OpenCodeConfig = config.$schema
    ? config
    : { $schema: OPENCODE_SCHEMA_URL, ...config };
  await writeFile(path, JSON.stringify(withSchema, null, 2) + '\n', 'utf8');
}

/**
 * Add the praxis overlay to `instructions[]`.
 *
 * This is OpenCode's analogue of the `@~/.praxis/main.md` import praxis
 * writes into CLAUDE.md: the overlay content stays in `~/.praxis/`, the
 * config only points at it, so `praxis update` never has to re-patch. The
 * absolute path is deliberate — it is the same convention OpenCode configs
 * already use for `{file:...}` prompts and it cannot be mis-expanded.
 */
export function addPraxisInstructions(config: OpenCodeConfig, mainMdPath: string): OpenCodeConfig {
  const existing = Array.isArray(config.instructions) ? config.instructions : [];
  if (existing.some((entry) => isPraxisInstruction(entry))) {
    return {
      ...config,
      instructions: existing.map((entry) => (isPraxisInstruction(entry) ? mainMdPath : entry)),
    };
  }
  // Appended last: praxis relies on recency, exactly as it does inside
  // CLAUDE.md.
  return { ...config, instructions: [...existing, mainMdPath] };
}

export function removePraxisInstructions(config: OpenCodeConfig): {
  config: OpenCodeConfig;
  removed: boolean;
} {
  const existing = Array.isArray(config.instructions) ? config.instructions : [];
  const kept = existing.filter((entry) => !isPraxisInstruction(entry));
  if (kept.length === existing.length) return { config, removed: false };
  const next: OpenCodeConfig = { ...config };
  if (kept.length === 0) {
    delete next.instructions;
  } else {
    next.instructions = kept;
  }
  return { config: next, removed: true };
}

/**
 * Recognise a praxis overlay entry regardless of how the home was spelled
 * (`~`, absolute POSIX, absolute Windows) so uninstall cleans up after an
 * install that ran under a different path form.
 */
export function isPraxisInstruction(entry: string): boolean {
  const normalized = entry.replace(/\\/g, '/').toLowerCase();
  return normalized.endsWith('.praxis/main.md');
}

export function hasPraxisInstructions(config: OpenCodeConfig): boolean {
  const existing = Array.isArray(config.instructions) ? config.instructions : [];
  return existing.some((entry) => isPraxisInstruction(entry));
}
