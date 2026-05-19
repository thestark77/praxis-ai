import { describe, it, expect } from 'vitest';
import {
  addPraxisAstHook,
  removePraxisAstHook,
  PRAXIS_AST_HOOK_MARKER,
  type ClaudeSettings,
} from '../../../src/lib/settings-patcher.js';

describe('addPraxisAstHook', () => {
  it('adds a Bash matcher hook block on an empty settings object', () => {
    const updated = addPraxisAstHook({}, 'praxis-ast-hook');
    expect(updated.hooks?.PreToolUse).toHaveLength(1);
    const entry = updated.hooks!.PreToolUse![0];
    expect(entry.matcher).toBe('Bash');
    expect(entry.hooks[0].command).toContain('praxis-ast-hook');
    expect(entry.hooks[0].command).toContain(PRAXIS_AST_HOOK_MARKER);
  });

  it('preserves an existing non-praxis hook entry', () => {
    const initial: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Edit',
            hooks: [{ type: 'command', command: 'user-pre-edit-hook.sh' }],
          },
        ],
      },
    };
    const updated = addPraxisAstHook(initial, 'praxis-ast-hook');
    expect(updated.hooks!.PreToolUse).toHaveLength(2);
    expect(updated.hooks!.PreToolUse![0].matcher).toBe('Edit');
  });

  it('is idempotent: re-adding does not duplicate', () => {
    const once = addPraxisAstHook({}, 'praxis-ast-hook');
    const twice = addPraxisAstHook(once, 'praxis-ast-hook');
    expect(twice.hooks!.PreToolUse).toHaveLength(1);
    expect(twice.hooks!.PreToolUse![0].hooks).toHaveLength(1);
  });

  it('updates the command if the marker is already present with a different command', () => {
    const once = addPraxisAstHook({}, 'old-command');
    const twice = addPraxisAstHook(once, 'new-command');
    expect(twice.hooks!.PreToolUse![0].hooks[0].command).toContain('new-command');
    expect(twice.hooks!.PreToolUse![0].hooks[0].command).toContain(PRAXIS_AST_HOOK_MARKER);
  });
});

describe('removePraxisAstHook', () => {
  it('removes the praxis-tagged hook entry only', () => {
    const initial: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              { type: 'command', command: `praxis-ast-hook ${PRAXIS_AST_HOOK_MARKER}` },
              { type: 'command', command: 'user-bash-hook' },
            ],
          },
        ],
      },
    };
    const updated = removePraxisAstHook(initial);
    expect(updated.hooks!.PreToolUse![0].hooks).toHaveLength(1);
    expect(updated.hooks!.PreToolUse![0].hooks[0].command).toBe('user-bash-hook');
  });

  it('removes the entire Bash matcher when its only hook was the praxis hook', () => {
    const initial: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: `praxis-ast-hook ${PRAXIS_AST_HOOK_MARKER}` }],
          },
          {
            matcher: 'Edit',
            hooks: [{ type: 'command', command: 'user-edit-hook' }],
          },
        ],
      },
    };
    const updated = removePraxisAstHook(initial);
    expect(updated.hooks!.PreToolUse).toHaveLength(1);
    expect(updated.hooks!.PreToolUse![0].matcher).toBe('Edit');
  });

  it('removes the entire hooks key when no entries remain', () => {
    const initial: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: `praxis-ast-hook ${PRAXIS_AST_HOOK_MARKER}` }],
          },
        ],
      },
    };
    const updated = removePraxisAstHook(initial);
    expect(updated.hooks).toBeUndefined();
  });

  it('is a no-op on settings without praxis hook entries', () => {
    const initial: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Edit',
            hooks: [{ type: 'command', command: 'user-edit-hook' }],
          },
        ],
      },
    };
    const updated = removePraxisAstHook(initial);
    expect(updated).toEqual(initial);
  });
});
