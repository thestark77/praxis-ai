// praxis-ai PreToolUse hook binary.
//
// Reads a Claude Code hook-event JSON object from stdin, inspects the
// Bash tool input (if any), and emits a hookSpecificOutput JSON
// document on stdout. Always exits 0; the JSON drives the decision.
//
// Hook input shape (Claude Code standard):
//   {
//     "session_id": "...",
//     "transcript_path": "...",
//     "tool_name": "Bash",
//     "tool_input": { "command": "..." }
//   }
//
// Hook output shape:
//   {
//     "hookSpecificOutput": {
//       "hookEventName": "PreToolUse",
//       "permissionDecision": "allow" | "deny" | "ask",
//       "permissionDecisionReason": "<string>"
//     }
//   }

import { inspectBashCommand } from '../lib/ast/inspect.js';
import { resolvePaths } from '../lib/paths.js';
import { openDatabase, closeDatabase } from '../lib/telemetry/db.js';
import { recordDenyHit } from '../lib/telemetry/events.js';
import type { RuleHit } from '../lib/ast/rules.js';

interface HookInput {
  session_id?: string;
  tool_name?: string;
  tool_input?: { command?: string };
}

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'allow' | 'deny' | 'ask';
    permissionDecisionReason: string;
  };
}

function emitDecision(decision: 'allow' | 'deny' | 'ask', reason: string): void {
  const out: HookOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(out));
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

/**
 * Persist a deny_hit telemetry event. Fail-open: any failure here is
 * swallowed because the hook must NEVER turn a deny into an allow on
 * its own machinery failure. The deny decision has already been emitted
 * on stdout by the time this is called.
 */
async function tryRecordDenyHit(
  sessionUuid: string | null,
  hits: RuleHit[],
  commandExcerpt: string,
): Promise<void> {
  if (process.env.PRAXIS_TELEMETRY_DISABLED === '1') return;
  if (hits.length === 0) return;
  try {
    const paths = resolvePaths();
    const db = await openDatabase({ path: paths.telemetryDb });
    try {
      for (const hit of hits) {
        recordDenyHit(db, sessionUuid, {
          rule: hit.ruleId,
          commandExcerpt: commandExcerpt.slice(0, 200),
        });
      }
    } finally {
      closeDatabase(db);
    }
  } catch {
    // Telemetry failure must not affect the decision. Already emitted.
  }
}

export async function runAstHook(): Promise<void> {
  const raw = await readStdin();
  let parsed: HookInput;
  try {
    parsed = JSON.parse(raw) as HookInput;
  } catch {
    // Malformed input — fail open. The hook should never block the user
    // when its own machinery is broken; the regex deny list still
    // applies as a baseline.
    emitDecision('allow', 'praxis-ai AST hook: input was not JSON; allowing by default.');
    return;
  }

  // Only inspect Bash. Other tools have their own permission semantics
  // and the AST hook has nothing useful to say about them.
  if (parsed.tool_name !== 'Bash') {
    emitDecision('allow', '');
    return;
  }

  const command = parsed.tool_input?.command ?? '';
  if (!command.trim()) {
    emitDecision('allow', '');
    return;
  }

  const result = inspectBashCommand(command);
  if (result.decision === 'allow') {
    emitDecision('allow', '');
    return;
  }
  // Decision goes out first; telemetry is best-effort after.
  emitDecision('deny', result.reason);
  await tryRecordDenyHit(parsed.session_id ?? null, result.hits, command);
}

// Allow `node ast-hook.js` to invoke directly when built. The compiled
// `dist/ast-hook.js` resolves the entry via the bin shim.
if (
  // Check if this module is being executed directly (CommonJS-style
  // detection within an ESM-built bundle).
  import.meta.url.endsWith('/ast-hook.js') ||
  import.meta.url.endsWith('/praxis-ast-hook.js')
) {
  void runAstHook();
}
