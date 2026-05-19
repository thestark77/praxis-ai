// SQLite schema for praxis-ai telemetry.
//
// Single events table with a typed JSON payload. Event-sourcing-lite:
// the table is append-only, aggregations live in queries.ts. Migrating
// the schema means stamping a new `schema_version` row and applying a
// new CREATE / ALTER block conditional on the prior version.

export const SCHEMA_VERSION = 1;

export const SCHEMA_PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`;

export const SCHEMA_DDL_V1 = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  session_uuid TEXT,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_uuid);
`;

/**
 * Event kinds praxis-ai records. Each kind has a payload shape declared
 * in events.ts — keep them in sync.
 */
export const EVENT_KINDS = {
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  PHASE_TRANSITION: 'phase_transition',
  TOOL_INVOCATION: 'tool_invocation',
  DENY_HIT: 'deny_hit',
  CONTEXT_SAMPLE: 'context_sample',
} as const;

export type EventKind = (typeof EVENT_KINDS)[keyof typeof EVENT_KINDS];
