import { describe, it, expect } from 'vitest';
import { inspectBashCommand } from '../../../src/lib/ast/inspect.js';

describe('git-path-invocation', () => {
  it('denies `/usr/bin/git push --force origin main` (absolute path evades a shim)', () => {
    const r = inspectBashCommand('/usr/bin/git push --force origin main');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-path-invocation')).toBe(true);
  });

  it('denies `/usr/local/bin/git status` even for a harmless subcommand', () => {
    // The rule denies the invocation shape (path-form git), not the
    // subcommand: a shim on PATH is only effective if every git
    // invocation goes through it.
    const r = inspectBashCommand('/usr/local/bin/git status');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-path-invocation')).toBe(true);
  });

  it('denies `./git log` (relative path)', () => {
    expect(inspectBashCommand('./git log').decision).toBe('deny');
  });

  it('denies `~/bin/git commit -m "x"` (home-relative path)', () => {
    expect(inspectBashCommand('~/bin/git commit -m "x"').decision).toBe('deny');
  });

  it('denies `../vendor/git fetch`', () => {
    expect(inspectBashCommand('../vendor/git fetch').decision).toBe('deny');
  });

  it.each([
    'env /usr/bin/git push --force origin main',
    'env -i PATH=/bin /usr/bin/git status',
    'GIT_DIR=.git /usr/bin/git status',
    'command /usr/bin/git status',
    'exec /usr/bin/git status',
    'nohup nice -n 5 /usr/bin/git fetch',
    'time /usr/bin/git log',
    'cd /tmp && env /usr/bin/git status',
  ])('denies path-form git behind a wrapper or env prefix: %s', (cmd) => {
    const r = inspectBashCommand(cmd);
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-path-invocation')).toBe(true);
  });

  it.each([
    'env -u NAME /usr/bin/git status',
    'env -C /some/dir /usr/bin/git status',
    'timeout 5 /usr/bin/git push --force',
    'stdbuf -oL /usr/bin/git log',
    'setsid /usr/bin/git status',
    'xargs /usr/bin/git status',
  ])('denies path-form git behind a wrapper this rule previously missed: %s', (cmd) => {
    const r = inspectBashCommand(cmd);
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-path-invocation')).toBe(true);
  });

  it.each(['sh -c "/usr/bin/git status"', "bash -c '/usr/bin/git push --force origin main'"])(
    'denies path-form git hidden inside a `sh -c` / `bash -c` body: %s',
    (cmd) => {
      const r = inspectBashCommand(cmd);
      expect(r.decision).toBe('deny');
      expect(r.hits.some((h) => h.ruleId === 'git-path-invocation')).toBe(true);
    },
  );

  it('denies `sudo -u x /usr/bin/git status` (via sudo-escalation, whichever rule fires)', () => {
    expect(inspectBashCommand('sudo -u x /usr/bin/git status').decision).toBe('deny');
  });

  it('allows plain `git` behind a wrapper or env prefix', () => {
    expect(inspectBashCommand('GIT_PAGER=cat env git log').decision).toBe('allow');
  });

  it('allows plain `git status` (no path component)', () => {
    expect(inspectBashCommand('git status').decision).toBe('allow');
  });

  it('allows plain `git push origin main` (no path component, no force)', () => {
    expect(inspectBashCommand('git push origin main').decision).toBe('allow');
  });

  it('does not false-positive on a different program that merely contains "git"', () => {
    expect(inspectBashCommand('/usr/bin/gitk --all').decision).toBe('allow');
    expect(inspectBashCommand('/usr/local/bin/git-lfs pull').decision).toBe('allow');
  });

  it('allows a path to git appearing only as an argument to a non-executing command', () => {
    expect(inspectBashCommand('ls -l /usr/bin/git').decision).toBe('allow');
    expect(inspectBashCommand('which git').decision).toBe('allow');
  });

  it('reports a guard-evasion reversibility class', () => {
    const r = inspectBashCommand('/usr/bin/git push --force origin main');
    expect(r.reason).toContain('guard-evasion');
  });
});

describe('read-bypass-token', () => {
  it('allows a quoted message that only names the file (no path shape)', () => {
    expect(inspectBashCommand('git commit -m "remove bypass.token handling"').decision).toBe(
      'allow',
    );
  });

  it('still denies a quoted relative path to the token', () => {
    expect(inspectBashCommand('cat "./bypass.token"').decision).toBe('deny');
  });

  const TOKEN_PATH = '~/.local/state/iris-worktrees/bypass.token';

  it('denies `cat` on the Iris worktree-guard bypass token', () => {
    const r = inspectBashCommand(`cat ${TOKEN_PATH}`);
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'read-bypass-token')).toBe(true);
  });

  it('denies `head` on the bypass token', () => {
    expect(inspectBashCommand(`head -n 1 ${TOKEN_PATH}`).decision).toBe('deny');
  });

  it('denies `less` on the bypass token', () => {
    expect(inspectBashCommand(`less ${TOKEN_PATH}`).decision).toBe('deny');
  });

  it('denies `cp` of the bypass token elsewhere', () => {
    expect(inspectBashCommand(`cp ${TOKEN_PATH} /tmp/x`).decision).toBe('deny');
  });

  it('denies `base64` encoding of the bypass token (exfiltration prep)', () => {
    expect(inspectBashCommand(`base64 ${TOKEN_PATH}`).decision).toBe('deny');
  });

  it('denies `xxd` dump of the bypass token', () => {
    expect(inspectBashCommand(`xxd ${TOKEN_PATH}`).decision).toBe('deny');
  });

  it('denies input redirection from the bypass token (`cmd < path`)', () => {
    expect(inspectBashCommand(`cat < ${TOKEN_PATH}`).decision).toBe('deny');
  });

  it('denies a double-quoted path with an unexpanded env var (`cat "$HOME/.../bypass.token"`)', () => {
    const r = inspectBashCommand('cat "$HOME/.local/state/iris-worktrees/bypass.token"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'read-bypass-token')).toBe(true);
  });

  it("denies a single-quoted path (`cat '/x/bypass.token'`)", () => {
    const r = inspectBashCommand("cat '/x/bypass.token'");
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'read-bypass-token')).toBe(true);
  });

  it('denies a bypass-token path passed as an `--opt=<path>` value', () => {
    const r = inspectBashCommand(
      'some-tool --input-file=~/.local/state/iris-worktrees/bypass.token',
    );
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'read-bypass-token')).toBe(true);
  });

  it('allows an unrelated `--opt=<path>` value', () => {
    expect(
      inspectBashCommand('some-tool --input-file=~/.local/state/iris-worktrees/session.json')
        .decision,
    ).toBe('allow');
  });

  it('allows a quoted prose mention split across two words even without stripping quotes first', () => {
    // "bypass" and "token" land as two separate words once the quoted
    // content is split on whitespace, so the pair-of-words check never
    // fires. This complements (does not replace) the existing quote-strip
    // based test above.
    expect(inspectBashCommand('echo "please avoid any bypass token here"').decision).toBe('allow');
  });

  it('uses a "touching" message that also fits non-read commands like `cp`', () => {
    const r = inspectBashCommand(`cp ${TOKEN_PATH} /tmp/x`);
    expect(r.hits[0].message).toMatch(/Touching a bypass-token path/);
  });

  it('denies a differently-ordered basename ("token" before "bypass")', () => {
    expect(inspectBashCommand('cat /tmp/token-bypass.txt').decision).toBe('deny');
  });

  it('denies mixed-case basenames', () => {
    expect(inspectBashCommand('cat ~/.local/state/iris-worktrees/Bypass.Token').decision).toBe(
      'deny',
    );
  });

  it('reports a secrets reversibility class', () => {
    const r = inspectBashCommand(`cat ${TOKEN_PATH}`);
    expect(r.reason).toContain('secrets');
  });

  it('allows a mere quoted mention ("bypass token") — the tokeniser strips quoted text', () => {
    expect(inspectBashCommand('echo "bypass token"').decision).toBe('allow');
  });

  it('allows a commit message that discusses bypass tokens in prose', () => {
    expect(
      inspectBashCommand('git commit -m "fix: reject bypass token reads in the AST hook"').decision,
    ).toBe('allow');
  });

  it('allows reading an unrelated file', () => {
    expect(inspectBashCommand('cat ~/.local/state/iris-worktrees/session.json').decision).toBe(
      'allow',
    );
  });

  it('allows a path containing only "token" without "bypass"', () => {
    expect(inspectBashCommand('cat ~/.config/gh/auth.token').decision).toBe('allow');
  });

  it('allows a path containing only "bypass" without "token"', () => {
    expect(inspectBashCommand('cat /tmp/bypass.log').decision).toBe('allow');
  });
});

describe('git-branch-force-delete', () => {
  it('denies `git branch -D feature`', () => {
    const r = inspectBashCommand('git branch -D feature');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-branch-force-delete')).toBe(true);
  });

  it('denies `git branch --delete --force feature`', () => {
    expect(inspectBashCommand('git branch --delete --force feature').decision).toBe('deny');
  });

  it('denies `git branch -d --force feature`', () => {
    expect(inspectBashCommand('git branch -d --force feature').decision).toBe('deny');
  });

  it('denies `git branch -d -f feature`', () => {
    expect(inspectBashCommand('git branch -d -f feature').decision).toBe('deny');
  });

  it('denies `git branch -df feature` (combined short flags)', () => {
    expect(inspectBashCommand('git branch -df feature').decision).toBe('deny');
  });

  it('denies `git branch -Df feature` (combined short flags)', () => {
    expect(inspectBashCommand('git branch -Df feature').decision).toBe('deny');
  });

  it('allows `git branch -d feature` (safe delete of a merged branch)', () => {
    expect(inspectBashCommand('git branch -d feature').decision).toBe('allow');
  });

  it('allows `git branch --delete feature` (safe delete, no force)', () => {
    expect(inspectBashCommand('git branch --delete feature').decision).toBe('allow');
  });

  it('allows `git branch --merged` (listing, not deleting)', () => {
    expect(inspectBashCommand('git branch --merged').decision).toBe('allow');
  });

  it('allows `git branch` (list branches)', () => {
    expect(inspectBashCommand('git branch').decision).toBe('allow');
  });

  it.each([
    'git -C repo branch -D x',
    'git -c k=v branch -D x',
    'git --git-dir=.git branch -D x',
    'env git branch -D x',
    'GIT_DIR=.git git branch -D x',
  ])('denies force-delete behind a git global option or a wrapper/env prefix: %s', (cmd) => {
    const r = inspectBashCommand(cmd);
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-branch-force-delete')).toBe(true);
  });

  it('allows a safe delete behind a git global option (`git -C repo branch -d x`)', () => {
    expect(inspectBashCommand('git -C repo branch -d x').decision).toBe('allow');
  });

  it('reports a delete reversibility class and tells the agent to verify the merge', () => {
    const r = inspectBashCommand('git branch -D feature');
    expect(r.reason).toContain('delete');
    expect(r.hits[0].message).toMatch(/--merged/);
    expect(r.hits[0].message).toMatch(/-d\b/);
  });
});
