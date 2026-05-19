import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, closeDatabase } from '../../src/lib/telemetry/db.js';
import { statsSummary } from '../../src/lib/telemetry/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const hookBin = resolve(__dirname, '..', '..', 'bin', 'praxis-ast-hook.js');

let sandboxHome: string;

beforeEach(async () => {
  sandboxHome = await mkdtemp(join(tmpdir(), 'praxis-hook-telemetry-'));
});

function runHook(input: unknown, env: NodeJS.ProcessEnv = {}): string {
  return execSync(`node ${hookBin}`, {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, HOME: sandboxHome, ...env },
  });
}

describe('praxis-ast-hook telemetry integration', () => {
  it('writes a deny_hit row to ~/.praxis/telemetry.db on every deny', async () => {
    runHook({
      session_id: 'sess-abc',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /tmp/x' },
    });

    const db = await openDatabase({ path: join(sandboxHome, '.praxis', 'telemetry.db') });
    try {
      const s = statsSummary(db);
      expect(s.denyHits).toBe(1);

      const row = db
        .prepare('SELECT session_uuid, payload FROM events WHERE kind = ?')
        .get('deny_hit') as { session_uuid: string; payload: string };
      expect(row.session_uuid).toBe('sess-abc');
      const p = JSON.parse(row.payload) as { rule: string; commandExcerpt: string };
      expect(p.rule).toBe('rm-recursive-force');
      expect(p.commandExcerpt).toContain('rm -rf');
    } finally {
      closeDatabase(db);
    }
  });

  it('writes one deny_hit row per matched rule on a chained command', async () => {
    runHook({
      session_id: null,
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /tmp/x && git push --force origin main' },
    });

    const db = await openDatabase({ path: join(sandboxHome, '.praxis', 'telemetry.db') });
    try {
      const s = statsSummary(db);
      // Each rule hit becomes its own deny_hit row.
      expect(s.denyHits).toBeGreaterThanOrEqual(2);
    } finally {
      closeDatabase(db);
    }
  });

  it('does NOT write any event on allow decisions', async () => {
    runHook({ tool_name: 'Bash', tool_input: { command: 'echo hello' } });
    // No telemetry DB should be created — the hook only opens it on deny.
    const stillEmpty = await (async () => {
      try {
        const db = await openDatabase({ path: join(sandboxHome, '.praxis', 'telemetry.db') });
        try {
          const s = statsSummary(db);
          return s.totalEvents === 0;
        } finally {
          closeDatabase(db);
        }
      } catch {
        return true; // DB does not exist at all
      }
    })();
    expect(stillEmpty).toBe(true);
  });

  it('still emits the deny decision when telemetry is disabled', () => {
    const out = runHook(
      {
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /tmp/x' },
      },
      { PRAXIS_TELEMETRY_DISABLED: '1' },
    );
    const parsed = JSON.parse(out) as {
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });
});
