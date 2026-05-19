import { mkdir, readdir, rm, copyFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';

export interface BackupEntry {
  timestamp: string;
  path: string;
  files: string[];
}

export interface BackupOptions {
  backupsDir: string;
  keep?: number;
}

const DEFAULT_KEEP = 10;

function timestamp(): string {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}` +
    `Z${pad(now.getUTCMilliseconds(), 3)}`
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function createBackup(files: string[], opts: BackupOptions): Promise<string> {
  const ts = timestamp();
  const dir = join(opts.backupsDir, ts);
  await mkdir(dir, { recursive: true });

  for (const file of files) {
    if (!(await exists(file))) continue;
    const target = join(dir, basename(file));
    await copyFile(file, target);
  }

  await rotateBackups({ backupsDir: opts.backupsDir, keep: opts.keep ?? DEFAULT_KEEP });
  return dir;
}

export async function listBackups(opts: BackupOptions): Promise<BackupEntry[]> {
  if (!(await exists(opts.backupsDir))) return [];
  const entries = await readdir(opts.backupsDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  dirs.sort().reverse();

  const result: BackupEntry[] = [];
  for (const ts of dirs) {
    const dir = join(opts.backupsDir, ts);
    const files = (await readdir(dir)).sort();
    result.push({ timestamp: ts, path: dir, files });
  }
  return result;
}

export async function restoreBackup(
  timestampStr: string,
  destinations: Record<string, string>,
  opts: BackupOptions,
): Promise<void> {
  const dir = join(opts.backupsDir, timestampStr);
  if (!(await exists(dir))) {
    throw new Error(`Backup not found: ${timestampStr}`);
  }
  for (const [basename_, destPath] of Object.entries(destinations)) {
    const source = join(dir, basename_);
    if (!(await exists(source))) continue;
    await copyFile(source, destPath);
  }
}

export async function restoreLatestBackup(
  destinations: Record<string, string>,
  opts: BackupOptions,
): Promise<string | null> {
  const backups = await listBackups(opts);
  if (backups.length === 0) return null;
  const latest = backups[0]!;
  await restoreBackup(latest.timestamp, destinations, opts);
  return latest.timestamp;
}

export async function rotateBackups(opts: BackupOptions): Promise<void> {
  const keep = opts.keep ?? DEFAULT_KEEP;
  const backups = await listBackups(opts);
  if (backups.length <= keep) return;
  const toDelete = backups.slice(keep);
  for (const backup of toDelete) {
    await rm(backup.path, { recursive: true, force: true });
  }
}
