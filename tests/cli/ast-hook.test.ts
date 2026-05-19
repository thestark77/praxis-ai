import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const hookBin = resolve(__dirname, '..', '..', 'bin', 'praxis-ast-hook.js');

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    permissionDecision: 'allow' | 'deny' | 'ask';
    permissionDecisionReason: string;
  };
}

function runHook(input: unknown): HookOutput {
  const stdin = typeof input === 'string' ? input : JSON.stringify(input);
  const stdout = execSync(`node ${hookBin}`, { input: stdin, encoding: 'utf8' });
  return JSON.parse(stdout) as HookOutput;
}

describe('praxis-ast-hook binary', () => {
  it('allows tools other than Bash', () => {
    const out = runHook({ tool_name: 'Edit', tool_input: {} });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('allows a safe bash command', () => {
    const out = runHook({ tool_name: 'Bash', tool_input: { command: 'echo hello' } });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('denies `rm -rf /tmp/x` with a useful reason', () => {
    const out = runHook({ tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/x' } });
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('rm-recursive-force');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('data-loss');
  });

  it('denies a base64-decoded execution payload', () => {
    const out = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'echo cm0gLXJmIC8K | base64 -d | bash' },
    });
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('encoded-execution');
  });

  it('catches `cd /; rm -rf *` (chain bypass)', () => {
    const out = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'cd /; rm -rf *' },
    });
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('fails open on malformed input', () => {
    const out = runHook('not json');
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput.permissionDecisionReason).toMatch(/not JSON/i);
  });
});
