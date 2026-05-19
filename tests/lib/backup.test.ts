import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createBackup,
  listBackups,
  restoreBackup,
  restoreLatestBackup,
  rotateBackups,
} from '../../src/lib/backup.js';

let workDir: string;
let backupsDir: string;
let claudeMd: string;
let settingsJson: string;

async function setup(): Promise<void> {
  workDir = await mkdtemp(join(tmpdir(), 'praxis-backup-test-'));
  backupsDir = join(workDir, 'backups');
  await mkdir(backupsDir, { recursive: true });
  claudeMd = join(workDir, 'CLAUDE.md');
  settingsJson = join(workDir, 'settings.json');
  await writeFile(claudeMd, 'original CLAUDE content\n');
  await writeFile(settingsJson, '{"original": true}\n');
}

describe('createBackup', () => {
  beforeEach(setup);

  it('creates a timestamped directory containing copied files', async () => {
    const dir = await createBackup([claudeMd, settingsJson], { backupsDir });
    const files = await readdir(dir);
    expect(files.sort()).toEqual(['CLAUDE.md', 'settings.json']);
    const content = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
    expect(content).toBe('original CLAUDE content\n');
  });

  it('skips files that do not exist', async () => {
    const missing = join(workDir, 'missing.txt');
    const dir = await createBackup([claudeMd, missing], { backupsDir });
    const files = await readdir(dir);
    expect(files).toEqual(['CLAUDE.md']);
  });
});

describe('listBackups', () => {
  beforeEach(setup);

  it('returns empty when backupsDir has no snapshots', async () => {
    const backups = await listBackups({ backupsDir });
    expect(backups).toEqual([]);
  });

  it('returns entries ordered newest first', async () => {
    await createBackup([claudeMd], { backupsDir });
    await new Promise((r) => setTimeout(r, 5));
    await createBackup([claudeMd], { backupsDir });
    const backups = await listBackups({ backupsDir });
    expect(backups.length).toBe(2);
    expect(backups[0]!.timestamp > backups[1]!.timestamp).toBe(true);
  });
});

describe('restoreBackup', () => {
  beforeEach(setup);

  it('restores a file to its destination path', async () => {
    const dir = await createBackup([claudeMd], { backupsDir });
    const ts = dir.split('/').pop()!;
    await writeFile(claudeMd, 'corrupted content');
    await restoreBackup(ts, { 'CLAUDE.md': claudeMd }, { backupsDir });
    const restored = await readFile(claudeMd, 'utf8');
    expect(restored).toBe('original CLAUDE content\n');
  });

  it('throws when the backup does not exist', async () => {
    await expect(
      restoreBackup('nonexistent', { 'CLAUDE.md': claudeMd }, { backupsDir }),
    ).rejects.toThrow('Backup not found');
  });
});

describe('restoreLatestBackup', () => {
  beforeEach(setup);

  it('restores from the most recent backup', async () => {
    await createBackup([claudeMd], { backupsDir });
    await new Promise((r) => setTimeout(r, 5));
    await writeFile(claudeMd, 'newer content\n');
    await createBackup([claudeMd], { backupsDir });
    await writeFile(claudeMd, 'corrupted');
    const ts = await restoreLatestBackup({ 'CLAUDE.md': claudeMd }, { backupsDir });
    expect(ts).toBeTruthy();
    const restored = await readFile(claudeMd, 'utf8');
    expect(restored).toBe('newer content\n');
  });

  it('returns null when there are no backups', async () => {
    const ts = await restoreLatestBackup({ 'CLAUDE.md': claudeMd }, { backupsDir });
    expect(ts).toBeNull();
  });
});

describe('rotateBackups', () => {
  beforeEach(setup);

  it('deletes backups beyond the keep threshold', async () => {
    for (let i = 0; i < 12; i++) {
      await createBackup([claudeMd], { backupsDir, keep: 100 });
      await new Promise((r) => setTimeout(r, 3));
    }
    await rotateBackups({ backupsDir, keep: 5 });
    const backups = await listBackups({ backupsDir });
    expect(backups.length).toBe(5);
  });

  it('rotates automatically during createBackup beyond default keep=10', async () => {
    for (let i = 0; i < 12; i++) {
      await createBackup([claudeMd], { backupsDir });
      await new Promise((r) => setTimeout(r, 3));
    }
    const backups = await listBackups({ backupsDir });
    expect(backups.length).toBe(10);
  });
});
