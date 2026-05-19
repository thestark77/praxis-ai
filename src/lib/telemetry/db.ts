import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { SCHEMA_DDL_V1, SCHEMA_PRAGMAS, SCHEMA_VERSION } from './schema.js';

export type Db = Database.Database;

export interface OpenDatabaseOptions {
  /** Filesystem path for the SQLite file. */
  path: string;
  /** If true, open read-only. Default: false. */
  readonly?: boolean;
}

/**
 * Open (and migrate) the telemetry database. The parent directory is
 * created if missing. Schema migrations are applied idempotently.
 *
 * The function is synchronous internally (better-sqlite3 is sync), but
 * the parent-dir creation is async.
 */
export async function openDatabase(opts: OpenDatabaseOptions): Promise<Db> {
  await mkdir(dirname(opts.path), { recursive: true });
  const db = new Database(opts.path, { readonly: opts.readonly ?? false });

  // PRAGMAs must be set before any other statement to take effect.
  db.exec(SCHEMA_PRAGMAS);

  if (!opts.readonly) {
    db.exec(SCHEMA_DDL_V1);

    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as
      | { v: number | null }
      | undefined;
    const currentVersion = row?.v ?? 0;
    if (currentVersion < SCHEMA_VERSION) {
      db.prepare('INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        SCHEMA_VERSION,
        Date.now(),
      );
    }
  }

  return db;
}

/** Close a database handle. Safe to call multiple times. */
export function closeDatabase(db: Db): void {
  if (db.open) {
    db.close();
  }
}
