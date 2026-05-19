import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ClaudeSettings {
  permissions?: {
    deny?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

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
