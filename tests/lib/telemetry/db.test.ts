import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, closeDatabase, type Db } from '../../../src/lib/telemetry/db.js';
import { SCHEMA_VERSION } from '../../../src/lib/telemetry/schema.js';

let workDir: string;
let db: Db | null;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'praxis-telemetry-db-'));
  db = null;
});

afterEach(() => {
  if (db) closeDatabase(db);
});

describe('openDatabase', () => {
  it('creates the parent directory if missing', async () => {
    const path = join(workDir, 'nested', 'subdir', 'telemetry.db');
    db = await openDatabase({ path });
    const s = await stat(path);
    expect(s.isFile()).toBe(true);
  });

  it('stamps the schema_version row on first open', async () => {
    const path = join(workDir, 'telemetry.db');
    db = await openDatabase({ path });
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number };
    expect(row.v).toBe(SCHEMA_VERSION);
  });

  it('re-opening is idempotent (no duplicate schema_version rows)', async () => {
    const path = join(workDir, 'telemetry.db');
    db = await openDatabase({ path });
    closeDatabase(db);
    db = await openDatabase({ path });
    const rows = db.prepare('SELECT version FROM schema_version').all();
    expect(rows.length).toBe(1);
  });

  it('readonly mode does not create or migrate but opens for reads', async () => {
    const path = join(workDir, 'telemetry.db');
    // Bootstrap once writable so the file exists.
    db = await openDatabase({ path });
    closeDatabase(db);
    db = await openDatabase({ path, readonly: true });
    expect(db.readonly).toBe(true);
    const row = db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number };
    expect(row.c).toBe(0);
  });
});
