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

export async function patchSettings(path: string, denyAdditions: string[]): Promise<void> {
  const settings = await readSettings(path);
  const updated = addDenyEntries(settings, denyAdditions);
  await writeSettings(path, updated);
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
