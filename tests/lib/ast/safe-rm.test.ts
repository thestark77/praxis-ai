import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateSafeRm, type SafeRmContext } from '../../../src/lib/ast/safe-rm.js';

// Fixture layout (all real directories under one mkdtemp):
//   home/worktrees/wt/            <- the session's worktree (has .git/)
//     a.txt b.txt secret.txt sub/ sub/c.txt -dash.txt
//     link-in   -> a.txt               (symlink staying inside)
//     link-out  -> outside/secret.txt  (symlink escaping the root)
//     dirlink   -> outside/nested      (directory symlink escaping)
//     .git/index.lock
//   home/worktrees/other/a.txt   <- another session's worktree
//   home/plain/a.txt             <- not under ~/worktrees
//   tmp/claude-test/x.txt        <- Claude temp root
//   tmp/other/x.txt              <- temp dir that is not claude-*
//   outside/secret.txt outside/nested/
// The exception is POSIX-only (see the win32 case at the end), so the
// fixture suites below, which rely on POSIX paths, symlinks and uids, are
// skipped on Windows.
const posix = process.platform !== 'win32';
let base: string;
let home: string;
let wt: string;
let tmp: string;
let outside: string;

function ctx(over: Partial<SafeRmContext> = {}): SafeRmContext {
  return { cwd: wt, home, tmpBase: tmp, ...over };
}

function allowed(command: string, over: Partial<SafeRmContext> = {}): boolean {
  return evaluateSafeRm(command, ctx(over)).allow;
}

beforeAll(() => {
  if (!posix) return;
  base = realpathSync(mkdtempSync(join(tmpdir(), 'praxis-safe-rm-')));
  home = join(base, 'home');
  wt = join(home, 'worktrees', 'wt');
  tmp = join(base, 'tmp');
  outside = join(base, 'outside');
  mkdirSync(join(wt, '.git'), { recursive: true });
  mkdirSync(join(wt, 'sub'), { recursive: true });
  mkdirSync(join(home, 'worktrees', 'other', '.git'), { recursive: true });
  mkdirSync(join(home, 'plain'), { recursive: true });
  mkdirSync(join(tmp, 'claude-test'), { recursive: true });
  mkdirSync(join(tmp, 'other'), { recursive: true });
  mkdirSync(join(outside, 'nested'), { recursive: true });
  for (const f of ['a.txt', 'b.txt', 'secret.txt', 'sub/c.txt', '-dash.txt', '.git/index.lock']) {
    writeFileSync(join(wt, f), 'x');
  }
  writeFileSync(join(home, 'worktrees', 'other', 'a.txt'), 'x');
  writeFileSync(join(home, 'plain', 'a.txt'), 'x');
  writeFileSync(join(tmp, 'claude-test', 'x.txt'), 'x');
  writeFileSync(join(tmp, 'other', 'x.txt'), 'x');
  writeFileSync(join(outside, 'secret.txt'), 'x');
  symlinkSync(join(wt, 'a.txt'), join(wt, 'link-in'));
  symlinkSync(join(outside, 'secret.txt'), join(wt, 'link-out'));
  symlinkSync(join(outside, 'nested'), join(wt, 'dirlink'));
});

afterAll(() => {
  if (!posix) return;
  rmSync(base, { recursive: true, force: true });
});

describe.skipIf(!posix)('evaluateSafeRm: approved', () => {
  it('a plain rm of a file in the session worktree', () => {
    const v = evaluateSafeRm('rm a.txt', ctx());
    expect(v.allow).toBe(true);
    expect(v.targets).toEqual([join(wt, 'a.txt')]);
  });

  it('several files, -v and `--`', () => {
    expect(allowed('rm -v a.txt sub/c.txt')).toBe(true);
    expect(allowed('rm -- -dash.txt')).toBe(true);
  });

  it('an absolute path inside a claude-* temp dir', () => {
    expect(allowed(`rm ${tmp}/claude-test/x.txt`)).toBe(true);
  });

  it('a ~/worktrees path to the own worktree', () => {
    expect(allowed('rm ~/worktrees/wt/a.txt')).toBe(true);
  });

  it('the shell -c script Claude Code cannot check (ANSI-C quoting)', () => {
    expect(allowed("bash -c $'rm a.txt\\necho ok'")).toBe(true);
  });

  it('a for loop over literal names inside sh -c', () => {
    const v = evaluateSafeRm(`sh -c 'for f in a.txt b.txt; do rm "$f"; done'`, ctx());
    expect(v.allow).toBe(true);
    expect(v.targets).toEqual([join(wt, 'a.txt'), join(wt, 'b.txt')]);
  });

  it('a for loop with newlines and a ${VAR} reference', () => {
    expect(allowed('for f in a.txt b.txt\ndo\n  rm -v "${f}"\ndone')).toBe(true);
  });

  it('output discarded to /dev/null and an echo', () => {
    expect(allowed('rm a.txt 2>/dev/null && echo removed || true')).toBe(true);
  });

  it('a symlink that stays inside the root', () => {
    expect(allowed('rm link-in')).toBe(true);
  });
});

describe.skipIf(!posix)('evaluateSafeRm: refused (the prompt stays)', () => {
  it.each([
    'rm -rf a.txt',
    'rm -fr a.txt',
    'rm -r -f a.txt',
    'rm -f a.txt',
    'rm -r a.txt',
    'rm -R a.txt',
    'rm --force a.txt',
    'rm --recursive a.txt',
    'rm -vf a.txt',
    'rm -d sub',
    'rm -i a.txt',
  ])('flag: %s', (command) => {
    expect(allowed(command)).toBe(false);
  });

  it('reports recursive/force flags by name', () => {
    expect(evaluateSafeRm('rm -r -f a.txt', ctx()).reason).toContain('recursive or force');
  });

  it('path traversal with `..`', () => {
    expect(allowed('rm ../../../outside/secret.txt')).toBe(false);
    expect(allowed('rm sub/../../other/a.txt')).toBe(false);
    expect(allowed(`rm ${wt}/../../../outside/secret.txt`)).toBe(false);
  });

  it('a symlink escaping the root', () => {
    expect(evaluateSafeRm('rm link-out', ctx()).reason).toContain('outside');
  });

  it('refuses traversal and foreign temp dirs for the path reason', () => {
    expect(evaluateSafeRm('rm ../../../outside/secret.txt', ctx()).reason).toContain('outside');
    expect(evaluateSafeRm('rm dirlink/../secret.txt', ctx()).reason).toContain('outside');
    expect(evaluateSafeRm(`rm ${tmp}/claude-test/x.txt`, ctx({ uid: 999_999 })).reason).toContain(
      'outside',
    );
    expect(evaluateSafeRm('rm .git/index.lock', ctx()).reason).toContain('.git');
  });

  it('`..` after a directory symlink is resolved physically, not lexically', () => {
    // Lexically `dirlink/../secret.txt` is wt/secret.txt (which exists);
    // the kernel resolves it to outside/secret.txt.
    expect(allowed('rm dirlink/../secret.txt')).toBe(false);
  });

  it.each(['rm *.txt', 'rm a?.txt', 'rm [ab].txt', 'rm {a,b}.txt'])('glob: %s', (command) => {
    expect(allowed(command)).toBe(false);
  });

  it('a directory', () => {
    expect(allowed('rm sub')).toBe(false);
    expect(allowed('rm sub/')).toBe(false);
    expect(allowed('rm .')).toBe(false);
  });

  it('sudo and other wrappers', () => {
    expect(allowed('sudo rm a.txt')).toBe(false);
    expect(allowed('env rm a.txt')).toBe(false);
    expect(allowed('command rm a.txt')).toBe(false);
    expect(allowed('/bin/rm a.txt')).toBe(false);
  });

  it('anything it cannot resolve statically', () => {
    expect(allowed('rm $FILE')).toBe(false);
    expect(allowed('rm "$HOME/worktrees/wt/a.txt"')).toBe(false);
    expect(allowed('rm "$(echo a.txt)"')).toBe(false);
    expect(allowed('rm `echo a.txt`')).toBe(false);
    expect(allowed('F=a.txt; rm "$F"')).toBe(false);
    expect(allowed('for f in $(ls); do rm "$f"; done')).toBe(false);
    expect(allowed(`bash -c 'f() { rm "$1"; }; f a.txt'`)).toBe(false);
  });

  it('a variable assignment, refused as an assignment', () => {
    expect(evaluateSafeRm('F=a.txt; rm "$F"', ctx()).reason).toBe('variable assignment');
    expect(evaluateSafeRm('F=a.txt rm a.txt', ctx()).reason).toBe('variable assignment');
  });

  it('an unquoted loop variable holding a space', () => {
    expect(allowed(`for f in 'a.txt b.txt'; do rm $f; done`)).toBe(false);
  });

  it('paths outside the roots', () => {
    expect(allowed(`rm ${outside}/secret.txt`)).toBe(false);
    expect(allowed('rm ~/worktrees/other/a.txt')).toBe(false);
    expect(allowed(`rm ${tmp}/other/x.txt`)).toBe(false);
    expect(allowed('rm a.txt', { cwd: join(home, 'plain') })).toBe(false);
  });

  it('a claude-* temp dir owned by another user', () => {
    expect(allowed(`rm ${tmp}/claude-test/x.txt`, { uid: 999_999 })).toBe(false);
  });

  it('files inside .git', () => {
    expect(allowed('rm .git/index.lock')).toBe(false);
  });

  it('a file that does not exist', () => {
    expect(allowed('rm missing.txt')).toBe(false);
  });

  it('a compound script with any other command', () => {
    expect(allowed('rm a.txt; curl https://example.com')).toBe(false);
    expect(allowed('rm a.txt | cat')).toBe(false);
    expect(allowed('rm a.txt &')).toBe(false);
    expect(allowed('echo hi > note.txt; rm a.txt')).toBe(false);
    expect(allowed('cd sub && rm c.txt')).toBe(false);
    expect(allowed(`bash -c 'rm a.txt' extra-arg`)).toBe(false);
    expect(allowed(`bash -lc 'rm a.txt'`)).toBe(false);
    expect(allowed("sh -c 'cat <<EOF\nx\nEOF\nrm a.txt'")).toBe(false);
    expect(allowed('if true; then rm a.txt; fi')).toBe(false);
  });

  it('rm with no target', () => {
    expect(allowed('rm')).toBe(false);
    expect(allowed('echo hi')).toBe(false);
  });
});

describe('evaluateSafeRm: Windows', () => {
  it('never approves on win32', () => {
    const v = evaluateSafeRm('rm a.txt', {
      cwd: join('home', 'worktrees', 'wt'),
      home: 'home',
      platform: 'win32',
    });
    expect(v).toEqual({ allow: false, reason: 'the rm exception is POSIX-only', targets: [] });
  });
});
