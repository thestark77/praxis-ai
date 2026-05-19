import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, closeDatabase, type Db } from '../../../src/lib/telemetry/db.js';
import {
  recordSessionStart,
  recordPhaseTransition,
  recordToolInvocation,
  recordDenyHit,
  recordContextSample,
} from '../../../src/lib/telemetry/events.js';
import {
  statsSummary,
  latestContextSample,
  resetEvents,
} from '../../../src/lib/telemetry/queries.js';

let workDir: string;
let db: Db;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'praxis-telemetry-queries-'));
  db = await openDatabase({ path: join(workDir, 'telemetry.db') });
});

afterEach(() => {
  closeDatabase(db);
});

describe('statsSummary', () => {
  it('returns zeros on an empty database', () => {
    const s = statsSummary(db);
    expect(s.totalEvents).toBe(0);
    expect(s.sessions).toBe(0);
    expect(s.toolInvocations).toBe(0);
    expect(s.toolInvocationsByOutcome).toEqual({});
    expect(s.denyHits).toBe(0);
    expect(s.phaseTransitionsByPhase).toEqual({});
    expect(s.contextSamples).toBe(0);
    expect(s.latestEventAt).toBeNull();
    expect(s.earliestEventAt).toBeNull();
  });

  it('aggregates a mixed event stream correctly', () => {
    recordSessionStart(db, 'sess-1', { cwd: '/a' });
    recordSessionStart(db, 'sess-2', { cwd: '/b' });
    recordToolInvocation(db, 'sess-1', { tool: 'Bash', outcome: 'success' });
    recordToolInvocation(db, 'sess-1', { tool: 'Bash', outcome: 'failure' });
    recordToolInvocation(db, 'sess-1', { tool: 'Read', outcome: 'success' });
    recordToolInvocation(db, 'sess-2', { tool: 'Bash', outcome: 'denied' });
    recordDenyHit(db, 'sess-2', { rule: 'Bash(rm -rf *)', commandExcerpt: 'rm -rf /' });
    recordPhaseTransition(db, 'sess-1', { from: 'F0', to: 'F1' });
    recordPhaseTransition(db, 'sess-1', { from: 'F1', to: 'F2' });
    recordPhaseTransition(db, 'sess-1', { from: 'F2', to: 'F3' });
    recordContextSample(db, 'sess-1', { used: 5000, budget: 200000 });

    const s = statsSummary(db);
    expect(s.totalEvents).toBe(11);
    expect(s.sessions).toBe(2);
    expect(s.toolInvocations).toBe(4);
    expect(s.toolInvocationsByOutcome).toEqual({ success: 2, failure: 1, denied: 1 });
    expect(s.denyHits).toBe(1);
    expect(s.phaseTransitionsByPhase).toEqual({ F1: 1, F2: 1, F3: 1 });
    expect(s.contextSamples).toBe(1);
    expect(s.earliestEventAt).not.toBeNull();
    expect(s.latestEventAt).not.toBeNull();
  });
});

describe('latestContextSample', () => {
  it('returns null when no samples exist', () => {
    expect(latestContextSample(db)).toBeNull();
  });

  it('returns the most recently inserted sample with percent computed', () => {
    recordContextSample(db, 'sess-1', { used: 1000, budget: 10000 }, { ts: 1000 });
    recordContextSample(db, 'sess-1', { used: 8000, budget: 10000 }, { ts: 2000 });
    const s = latestContextSample(db);
    expect(s).not.toBeNull();
    expect(s!.used).toBe(8000);
    expect(s!.budget).toBe(10000);
    expect(s!.percent).toBe(80);
    expect(s!.ts).toBe(2000);
  });

  it('handles zero budget gracefully', () => {
    recordContextSample(db, null, { used: 100, budget: 0 });
    const s = latestContextSample(db);
    expect(s!.percent).toBe(0);
  });
});

describe('resetEvents', () => {
  it('deletes all rows and returns the count', () => {
    recordSessionStart(db, 'sess', { cwd: '/x' });
    recordToolInvocation(db, 'sess', { tool: 'Read', outcome: 'success' });
    expect(statsSummary(db).totalEvents).toBe(2);
    const { deleted } = resetEvents(db);
    expect(deleted).toBe(2);
    expect(statsSummary(db).totalEvents).toBe(0);
  });
});
