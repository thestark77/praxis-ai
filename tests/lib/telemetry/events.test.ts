import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, closeDatabase, type Db } from '../../../src/lib/telemetry/db.js';
import {
  recordEvent,
  recordSessionStart,
  recordPhaseTransition,
  recordToolInvocation,
  recordDenyHit,
  recordContextSample,
} from '../../../src/lib/telemetry/events.js';
import { EVENT_KINDS } from '../../../src/lib/telemetry/schema.js';

let workDir: string;
let db: Db;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'praxis-telemetry-events-'));
  db = await openDatabase({ path: join(workDir, 'telemetry.db') });
});

afterEach(() => {
  closeDatabase(db);
});

describe('recordEvent', () => {
  it('inserts a row and returns the assigned id', () => {
    const { id } = recordEvent(db, EVENT_KINDS.SESSION_START, { cwd: '/tmp' });
    expect(id).toBeGreaterThan(0);

    const row = db
      .prepare('SELECT kind, payload, session_uuid FROM events WHERE id = ?')
      .get(id) as { kind: string; payload: string; session_uuid: string | null };
    expect(row.kind).toBe('session_start');
    expect(JSON.parse(row.payload)).toEqual({ cwd: '/tmp' });
    expect(row.session_uuid).toBeNull();
  });

  it('honors an explicit timestamp', () => {
    const ts = 1_700_000_000_000;
    const { id } = recordEvent(
      db,
      EVENT_KINDS.TOOL_INVOCATION,
      {
        tool: 'Bash',
        outcome: 'success',
      },
      { ts },
    );
    const row = db.prepare('SELECT ts FROM events WHERE id = ?').get(id) as { ts: number };
    expect(row.ts).toBe(ts);
  });
});

describe('typed wrappers', () => {
  it('recordSessionStart attaches the session uuid', () => {
    const { id } = recordSessionStart(db, 'sess-abc', { cwd: '/tmp/x' });
    const row = db.prepare('SELECT session_uuid AS u FROM events WHERE id = ?').get(id) as {
      u: string;
    };
    expect(row.u).toBe('sess-abc');
  });

  it('recordPhaseTransition records to/from phase fields', () => {
    const { id } = recordPhaseTransition(db, 'sess-abc', { from: 'F1', to: 'F2', reason: 'apply' });
    const row = db.prepare('SELECT payload FROM events WHERE id = ?').get(id) as {
      payload: string;
    };
    const p = JSON.parse(row.payload);
    expect(p.from).toBe('F1');
    expect(p.to).toBe('F2');
    expect(p.reason).toBe('apply');
  });

  it('recordToolInvocation accepts a null session uuid', () => {
    const { id } = recordToolInvocation(db, null, { tool: 'Read', outcome: 'success' });
    const row = db.prepare('SELECT session_uuid AS u FROM events WHERE id = ?').get(id) as {
      u: string | null;
    };
    expect(row.u).toBeNull();
  });

  it('recordDenyHit captures rule + command excerpt', () => {
    recordDenyHit(db, null, { rule: 'Bash(rm -rf *)', commandExcerpt: 'rm -rf /' });
    const row = db
      .prepare('SELECT payload FROM events WHERE kind = ?')
      .get(EVENT_KINDS.DENY_HIT) as { payload: string };
    expect(JSON.parse(row.payload).rule).toBe('Bash(rm -rf *)');
  });

  it('recordContextSample stores used + budget', () => {
    recordContextSample(db, 'sess-xyz', { used: 30000, budget: 200000 });
    const row = db
      .prepare('SELECT payload FROM events WHERE kind = ?')
      .get(EVENT_KINDS.CONTEXT_SAMPLE) as { payload: string };
    const p = JSON.parse(row.payload);
    expect(p.used).toBe(30000);
    expect(p.budget).toBe(200000);
  });
});
