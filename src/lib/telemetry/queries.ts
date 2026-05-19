import { EVENT_KINDS } from './schema.js';
import type { Db } from './db.js';

export interface StatsSummary {
  totalEvents: number;
  sessions: number;
  toolInvocations: number;
  toolInvocationsByOutcome: Record<string, number>;
  denyHits: number;
  phaseTransitionsByPhase: Record<string, number>;
  contextSamples: number;
  latestEventAt: number | null;
  earliestEventAt: number | null;
}

export function statsSummary(db: Db): StatsSummary {
  const total = (db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }).c;

  const sessions = (
    db
      .prepare('SELECT COUNT(*) AS c FROM events WHERE kind = ?')
      .get(EVENT_KINDS.SESSION_START) as { c: number }
  ).c;

  const toolInvocations = (
    db
      .prepare('SELECT COUNT(*) AS c FROM events WHERE kind = ?')
      .get(EVENT_KINDS.TOOL_INVOCATION) as { c: number }
  ).c;

  const outcomeRows = db
    .prepare<
      [string]
    >("SELECT json_extract(payload, '$.outcome') AS outcome, COUNT(*) AS c " + 'FROM events WHERE kind = ? GROUP BY outcome')
    .all(EVENT_KINDS.TOOL_INVOCATION) as Array<{ outcome: string; c: number }>;
  const toolInvocationsByOutcome: Record<string, number> = {};
  for (const r of outcomeRows) {
    toolInvocationsByOutcome[r.outcome] = r.c;
  }

  const denyHits = (
    db.prepare('SELECT COUNT(*) AS c FROM events WHERE kind = ?').get(EVENT_KINDS.DENY_HIT) as {
      c: number;
    }
  ).c;

  const phaseRows = db
    .prepare<
      [string]
    >("SELECT json_extract(payload, '$.to') AS to_phase, COUNT(*) AS c " + 'FROM events WHERE kind = ? GROUP BY to_phase')
    .all(EVENT_KINDS.PHASE_TRANSITION) as Array<{ to_phase: string; c: number }>;
  const phaseTransitionsByPhase: Record<string, number> = {};
  for (const r of phaseRows) {
    phaseTransitionsByPhase[r.to_phase] = r.c;
  }

  const contextSamples = (
    db
      .prepare('SELECT COUNT(*) AS c FROM events WHERE kind = ?')
      .get(EVENT_KINDS.CONTEXT_SAMPLE) as { c: number }
  ).c;

  const tsBounds = db
    .prepare('SELECT MIN(ts) AS earliest, MAX(ts) AS latest FROM events')
    .get() as { earliest: number | null; latest: number | null };

  return {
    totalEvents: total,
    sessions,
    toolInvocations,
    toolInvocationsByOutcome,
    denyHits,
    phaseTransitionsByPhase,
    contextSamples,
    latestEventAt: tsBounds.latest,
    earliestEventAt: tsBounds.earliest,
  };
}

export interface LatestContextSample {
  used: number;
  budget: number;
  percent: number;
  ts: number;
  sessionUuid: string | null;
}

export function latestContextSample(db: Db): LatestContextSample | null {
  const row = db
    .prepare(
      'SELECT ts, session_uuid AS sessionUuid, payload FROM events ' +
        'WHERE kind = ? ORDER BY ts DESC LIMIT 1',
    )
    .get(EVENT_KINDS.CONTEXT_SAMPLE) as
    | { ts: number; sessionUuid: string | null; payload: string }
    | undefined;
  if (!row) return null;
  const parsed = JSON.parse(row.payload) as { used: number; budget: number };
  const percent = parsed.budget > 0 ? (parsed.used / parsed.budget) * 100 : 0;
  return {
    used: parsed.used,
    budget: parsed.budget,
    percent,
    ts: row.ts,
    sessionUuid: row.sessionUuid,
  };
}

/** Truncate all event data. Used by tests and by `praxis stats --reset`. */
export function resetEvents(db: Db): { deleted: number } {
  const info = db.prepare('DELETE FROM events').run();
  return { deleted: Number(info.changes) };
}
