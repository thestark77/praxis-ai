import { EVENT_KINDS, type EventKind } from './schema.js';
import type { Db } from './db.js';

export interface SessionStartPayload {
  cwd: string;
  preset?: string;
}

export interface SessionEndPayload {
  reason?: string;
}

export interface PhaseTransitionPayload {
  from: string | null;
  to: 'F0' | 'F1' | 'F2' | 'F3';
  reason?: string;
}

export interface ToolInvocationPayload {
  tool: string;
  outcome: 'success' | 'failure' | 'denied';
  durationMs?: number;
}

export interface DenyHitPayload {
  rule: string;
  commandExcerpt: string;
}

export interface ContextSamplePayload {
  used: number;
  budget: number;
}

export type Payload =
  | SessionStartPayload
  | SessionEndPayload
  | PhaseTransitionPayload
  | ToolInvocationPayload
  | DenyHitPayload
  | ContextSamplePayload;

export interface RecordEventOptions {
  ts?: number;
  sessionUuid?: string | null;
}

/**
 * Append an event row. Uses a single prepared statement reused per
 * connection for efficiency.
 */
export function recordEvent(
  db: Db,
  kind: EventKind,
  payload: Payload,
  opts: RecordEventOptions = {},
): { id: number } {
  const ts = opts.ts ?? Date.now();
  const sessionUuid = opts.sessionUuid ?? null;
  const stmt = db.prepare<[number, string | null, string, string]>(
    'INSERT INTO events (ts, session_uuid, kind, payload) VALUES (?, ?, ?, ?)',
  );
  const info = stmt.run(ts, sessionUuid, kind, JSON.stringify(payload));
  return { id: Number(info.lastInsertRowid) };
}

// Typed convenience wrappers — let callers skip the kind string.

export function recordSessionStart(
  db: Db,
  sessionUuid: string,
  payload: SessionStartPayload,
  opts: Omit<RecordEventOptions, 'sessionUuid'> = {},
): { id: number } {
  return recordEvent(db, EVENT_KINDS.SESSION_START, payload, { ...opts, sessionUuid });
}

export function recordSessionEnd(
  db: Db,
  sessionUuid: string,
  payload: SessionEndPayload,
  opts: Omit<RecordEventOptions, 'sessionUuid'> = {},
): { id: number } {
  return recordEvent(db, EVENT_KINDS.SESSION_END, payload, { ...opts, sessionUuid });
}

export function recordPhaseTransition(
  db: Db,
  sessionUuid: string,
  payload: PhaseTransitionPayload,
  opts: Omit<RecordEventOptions, 'sessionUuid'> = {},
): { id: number } {
  return recordEvent(db, EVENT_KINDS.PHASE_TRANSITION, payload, { ...opts, sessionUuid });
}

export function recordToolInvocation(
  db: Db,
  sessionUuid: string | null,
  payload: ToolInvocationPayload,
  opts: Omit<RecordEventOptions, 'sessionUuid'> = {},
): { id: number } {
  return recordEvent(db, EVENT_KINDS.TOOL_INVOCATION, payload, { ...opts, sessionUuid });
}

export function recordDenyHit(
  db: Db,
  sessionUuid: string | null,
  payload: DenyHitPayload,
  opts: Omit<RecordEventOptions, 'sessionUuid'> = {},
): { id: number } {
  return recordEvent(db, EVENT_KINDS.DENY_HIT, payload, { ...opts, sessionUuid });
}

export function recordContextSample(
  db: Db,
  sessionUuid: string | null,
  payload: ContextSamplePayload,
  opts: Omit<RecordEventOptions, 'sessionUuid'> = {},
): { id: number } {
  return recordEvent(db, EVENT_KINDS.CONTEXT_SAMPLE, payload, { ...opts, sessionUuid });
}
