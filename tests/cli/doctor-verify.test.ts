import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitCommand } from '../../src/cli/doctor.js';
import { resolveAstHookCommand } from '../../src/lib/install.js';

// Three faults found by running `praxis doctor --verify` against a real
// installation instead of a fixture. Two of them made the firewall's own
// verification lie, and the third could switch layer 2 off silently.

describe('splitCommand', () => {
  // A plain whitespace split keeps the quote characters inside the token,
  // so `node "C:/path/hook.js"` execs node against a filename that starts
  // with a double quote. node fails, stdout is empty, and verify blamed
  // the hook: `Hook stdout was not JSON`.
  it('strips the quotes around a path instead of passing them through', () => {
    expect(splitCommand('node "C:/Users/me/.praxis/engine/ast-hook.js"')).toEqual([
      'node',
      'C:/Users/me/.praxis/engine/ast-hook.js',
    ]);
  });

  it('keeps a quoted path with spaces as one argument', () => {
    expect(splitCommand('node "C:/Users/First Last/hook.js"')).toEqual([
      'node',
      'C:/Users/First Last/hook.js',
    ]);
  });

  it('handles single quotes the same way', () => {
    expect(splitCommand("node 'C:/Users/First Last/hook.js'")).toEqual([
      'node',
      'C:/Users/First Last/hook.js',
    ]);
  });

  it('leaves an unquoted command untouched', () => {
    expect(splitCommand('praxis-ast-hook')).toEqual(['praxis-ast-hook']);
  });

  it('collapses runs of whitespace', () => {
    expect(splitCommand('  node    hook.js  ')).toEqual(['node', 'hook.js']);
  });

  it('preserves an explicitly empty argument', () => {
    expect(splitCommand('cmd "" tail')).toEqual(['cmd', '', 'tail']);
  });

  it('returns nothing for an empty command', () => {
    expect(splitCommand('   ')).toEqual([]);
  });

  it('does not interpret anything but quotes', () => {
    // The command is exec'd directly, never through a shell, so a glob or
    // a variable must arrive at the program verbatim.
    expect(splitCommand('node hook.js $HOME *.js')).toEqual(['node', 'hook.js', '$HOME', '*.js']);
  });
});

describe('the hook command praxis writes', () => {
  // `resolveAstHookCommand` only emits a `node <path>` command when it
  // finds a sibling `praxis-ast-hook.js` next to `process.argv[1]`. Under
  // vitest that is vitest's own entry, so it returns the bare bin name and
  // an unguarded assertion would pass without ever reaching the branch
  // being tested. Point argv at this repo's own CLI, which does have that
  // sibling, so the local-checkout path actually runs.
  const repoCli = resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'bin', 'praxis.js');

  async function localCheckoutCommand(): Promise<string> {
    const saved = process.argv[1];
    process.argv[1] = repoCli;
    try {
      return await resolveAstHookCommand();
    } finally {
      process.argv[1] = saved;
    }
  }

  it('quotes the script path', async () => {
    // Claude Code runs this through a shell. Unquoted, a path containing a
    // space is split into separate arguments and node reports
    // `Cannot find module 'C:\Users\First'` -- the hook then emits no
    // decision at all, so the command proceeds and layer 2 is off with
    // nothing saying so.
    const command = await localCheckoutCommand();
    expect(command).toMatch(/^node "/);
    expect(command.endsWith('"')).toBe(true);
  });

  it('round-trips through the splitter it will be verified with', async () => {
    const argv = splitCommand(await localCheckoutCommand());
    expect(argv[0]).toBe('node');
    expect(argv).toHaveLength(2);
    expect(argv[1]).toMatch(/praxis-ast-hook\.js$/);
    for (const arg of argv) expect(arg).not.toMatch(/["']/);
  });
});
