import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ClaudeHookEntry {
  type: 'command';
  command: string;
}

export interface ClaudeHookMatcher {
  matcher?: string;
  hooks: ClaudeHookEntry[];
}

export interface ClaudeSettings {
  permissions?: {
    deny?: string[];
    [key: string]: unknown;
  };
  hooks?: {
    PreToolUse?: ClaudeHookMatcher[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const PRAXIS_AST_HOOK_MARKER = '#praxis-ast-hook#';

export function addDenyEntries(settings: ClaudeSettings, entries: string[]): ClaudeSettings {
  const result: ClaudeSettings = { ...settings };
  const permissions = { ...(result.permissions ?? {}) };
  const existing = permissions.deny ?? [];
  const seen = new Set(existing);
  const merged = [...existing];
  for (const entry of entries) {
    if (!seen.has(entry)) {
      merged.push(entry);
      seen.add(entry);
    }
  }
  permissions.deny = merged;
  result.permissions = permissions;
  return result;
}

export function removeDenyEntries(settings: ClaudeSettings, entries: string[]): ClaudeSettings {
  const result: ClaudeSettings = { ...settings };
  if (!result.permissions) return result;
  const permissions = { ...result.permissions };
  const toRemove = new Set(entries);
  permissions.deny = (permissions.deny ?? []).filter((e) => !toRemove.has(e));
  result.permissions = permissions;
  return result;
}

export async function readSettings(path: string): Promise<ClaudeSettings> {
  try {
    const content = await readFile(path, 'utf8');
    return JSON.parse(content) as ClaudeSettings;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return {};
    throw err;
  }
}

export async function writeSettings(path: string, settings: ClaudeSettings): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const json = JSON.stringify(settings, null, 2);
  await writeFile(path, json + '\n', 'utf8');
}

/**
 * Add the deny entries and report which ones were genuinely new.
 *
 * The return value is what the ownership ledger records. Entries already
 * present were written by somebody else — gentle-ai, a team settings file,
 * the user — and praxis must not claim them, or uninstall will delete
 * protection it never installed.
 */
export async function patchSettings(path: string, denyAdditions: string[]): Promise<string[]> {
  const settings = await readSettings(path);
  const existing = new Set(settings.permissions?.deny ?? []);
  const added = denyAdditions.filter((entry) => !existing.has(entry));
  const updated = addDenyEntries(settings, denyAdditions);
  await writeSettings(path, updated);
  return added;
}

export async function unpatchSettings(path: string, denyAdditions: string[]): Promise<void> {
  const settings = await readSettings(path);
  const updated = removeDenyEntries(settings, denyAdditions);
  await writeSettings(path, updated);
}

/**
 * Register the praxis-ai AST PreToolUse hook in settings.json. The hook
 * is marker-tagged so subsequent installs are idempotent and uninstall
 * can find its entry to remove. Existing user hooks are preserved.
 */
export function addPraxisAstHook(settings: ClaudeSettings, hookCommand: string): ClaudeSettings {
  const result: ClaudeSettings = { ...settings };
  const hooks = { ...(result.hooks ?? {}) };
  const preList: ClaudeHookMatcher[] = Array.isArray(hooks.PreToolUse) ? [...hooks.PreToolUse] : [];

  const taggedCommand = `${hookCommand} ${PRAXIS_AST_HOOK_MARKER}`;

  // If any praxis-tagged entry already exists, replace its command; do
  // not duplicate. Otherwise append a new matcher block.
  let replaced = false;
  for (let i = 0; i < preList.length; i++) {
    const entry = preList[i];
    if (entry.matcher !== 'Bash') continue;
    const idx = entry.hooks.findIndex((h) => h.command.includes(PRAXIS_AST_HOOK_MARKER));
    if (idx >= 0) {
      const newHooks = [...entry.hooks];
      newHooks[idx] = { type: 'command', command: taggedCommand };
      preList[i] = { ...entry, hooks: newHooks };
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    preList.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: taggedCommand }],
    });
  }

  hooks.PreToolUse = preList;
  result.hooks = hooks;
  return result;
}

export function removePraxisAstHook(settings: ClaudeSettings): ClaudeSettings {
  const result: ClaudeSettings = { ...settings };
  if (!result.hooks?.PreToolUse) return result;
  const hooks = { ...result.hooks };
  const filteredMatchers: ClaudeHookMatcher[] = [];
  for (const matcher of hooks.PreToolUse ?? []) {
    const filteredHooks = matcher.hooks.filter((h) => !h.command.includes(PRAXIS_AST_HOOK_MARKER));
    if (filteredHooks.length > 0) {
      filteredMatchers.push({ ...matcher, hooks: filteredHooks });
    }
  }
  if (filteredMatchers.length > 0) {
    hooks.PreToolUse = filteredMatchers;
  } else {
    delete hooks.PreToolUse;
  }
  if (Object.keys(hooks).length === 0) {
    delete result.hooks;
  } else {
    result.hooks = hooks;
  }
  return result;
}

/**
 * What Claude Code's `attribution` setting looks like on disk.
 *
 * `commit` and `pr` are the text Claude Code appends to commit messages
 * (`Co-Authored-By: ...`) and to pull request descriptions. An empty string
 * hides the attribution. Other fields are kept as found. The older boolean
 * `includeCoAuthoredBy` is deprecated and is never written.
 */
export interface ClaudeAttribution {
  commit?: string;
  pr?: string;
  [key: string]: unknown;
}

/**
 * Where a settings file stands against praxis's wish for empty attribution.
 *
 * - `enforced`: `commit` and `pr` are both empty strings.
 * - `absent`: no `attribution` key, so Claude Code adds its defaults.
 * - `custom`: anything else, including a half-set value such as an empty
 *   `commit` with no `pr` (Claude Code then falls back to its PR footer).
 */
export type AttributionState = 'enforced' | 'absent' | 'custom';

/** Result of trying to enforce empty attribution on a settings object. */
export type AttributionOutcome = 'written' | 'unchanged' | 'kept-custom';

/**
 * The `attribution` value a settings file held before praxis wrote to it.
 * This is what the ownership ledger records so uninstall can give it back:
 * `present: false` means the key did not exist and must be removed again.
 */
export interface PreviousAttribution {
  present: boolean;
  value?: unknown;
}

function isAttributionObject(value: unknown): value is ClaudeAttribution {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function attributionState(settings: ClaudeSettings): AttributionState {
  if (!('attribution' in settings)) return 'absent';
  const value = settings.attribution;
  if (isAttributionObject(value) && value.commit === '' && value.pr === '') return 'enforced';
  return 'custom';
}

/**
 * Enforce `attribution: { commit: "", pr: "" }` without disturbing any other
 * key. Pure: the input is never mutated.
 *
 * A custom value is the user's own choice, so it is kept unless `force` is
 * set, the same rule `praxis install` applies to a skeleton file or a skill
 * the user already has. Under `force` the sibling fields of the old object
 * survive and only `commit` and `pr` are emptied; the whole old value is
 * returned in `previous` so uninstall can restore it.
 */
export function applyEmptyAttribution(
  settings: ClaudeSettings,
  opts: { force?: boolean },
): { settings: ClaudeSettings; outcome: AttributionOutcome; previous: PreviousAttribution } {
  const state = attributionState(settings);
  if (state === 'enforced') {
    return {
      settings: { ...settings },
      outcome: 'unchanged',
      previous: { present: true, value: settings.attribution },
    };
  }
  if (state === 'custom' && !opts.force) {
    return {
      settings: { ...settings },
      outcome: 'kept-custom',
      previous: { present: true, value: settings.attribution },
    };
  }
  const existing = settings.attribution;
  const base = state === 'custom' && isAttributionObject(existing) ? existing : {};
  return {
    settings: { ...settings, attribution: { ...base, commit: '', pr: '' } },
    outcome: 'written',
    previous: state === 'custom' ? { present: true, value: existing } : { present: false },
  };
}

/**
 * Undo `applyEmptyAttribution`: put back the value that was there before, or
 * remove the key if there was none. Only acts while the setting still reads
 * as enforced, so a value the user edited after install is never clobbered.
 */
export function revertEmptyAttribution(
  settings: ClaudeSettings,
  previous: PreviousAttribution,
): { settings: ClaudeSettings; reverted: boolean } {
  if (attributionState(settings) !== 'enforced') {
    return { settings: { ...settings }, reverted: false };
  }
  const result: ClaudeSettings = { ...settings };
  if (previous.present) result.attribution = previous.value;
  else delete result.attribution;
  return { settings: result, reverted: true };
}
