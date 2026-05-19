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

interface HookInput {
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
  emitDecision('deny', result.reason);
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
