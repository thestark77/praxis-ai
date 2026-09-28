import { describe, it, expect } from 'vitest';
import { inspectBashCommand } from '../../../src/lib/ast/inspect.js';

// T7 inspector-normalization.
//
// Moves wrapper/env-assignment/`sh -c` normalization from individual rules
// into the inspector itself, so EVERY rule sees the effective command, and
// teaches the inspector to enqueue a shell's `-c` body (and `eval`'s
// arguments, and `env -S`'s split-string value) for full re-inspection.
// This closes the pre-existing gap where `bash -c "rm -rf /"` evaded every
// rule (the `-c` body was never re-inspected), and the T4 known limits:
// `env -S`, `bash -lc`, `xargs -I {}`, and a chained `sh -c "a && git ..."`
// tail.

/** Wraps `inner` in `levels` nested `bash -c '...'` layers, alternating
 * quote style at each level. This deliberately DOES escape the accumulated
 * body at every level (the single-quote `'\''` idiom on odd layers,
 * backslash-escaping `"` and `\` on even ones) rather than picking a quote
 * style that would let the nesting round-trip unescaped — on purpose, so
 * each generated command actually exercises `argvWithSpans`'s quote-escape
 * parser path (the same `'\''`-idiom handling and backslash-escape
 * handling documented on that function) at every nesting level instead of
 * only testing the happy path once. */
function wrapShellC(inner: string, levels: number): string {
  let cmd = inner;
  for (let i = 0; i < levels; i++) {
    const single = i % 2 === 0;
    if (single) {
      cmd = `bash -c '${cmd.replace(/'/g, `'\\''`)}'`;
    } else {
      cmd = `bash -c "${cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
  }
  return cmd;
}

/** Wraps `inner` in `levels` nested `$(...)` command substitutions
 * (`echo $(echo $(... inner ...))`), for testing depth-bound fail-closed
 * behavior on substitution-only nesting — no shell `-c` hand-off involved
 * at any level. */
function wrapSubstitution(inner: string, levels: number): string {
  let cmd = inner;
  for (let i = 0; i < levels; i++) {
    cmd = `echo $(${cmd})`;
  }
  return cmd;
}

describe('inspector-normalization — false-positive guards (ALLOW)', () => {
  it('allows quoted prose naming `bash -c rm -rf /` (echo is not a shell)', () => {
    expect(inspectBashCommand('echo "bash -c rm -rf /"').decision).toBe('allow');
  });

  it('allows a commit message that mentions `sh -c` in prose', () => {
    expect(inspectBashCommand('git commit -m "use sh -c carefully"').decision).toBe('allow');
  });

  it('allows grepping for the literal string `sh -c`', () => {
    expect(inspectBashCommand('grep -rn "sh -c" src').decision).toBe('allow');
  });

  it('allows `bash script.sh` (no -c, running a script file)', () => {
    expect(inspectBashCommand('bash script.sh').decision).toBe('allow');
  });

  it('allows `bash -n script.sh` (syntax check only, no -c)', () => {
    expect(inspectBashCommand('bash -n script.sh').decision).toBe('allow');
  });

  it('allows `bash -e script.sh` (no -c cluster, just an option before a script path)', () => {
    expect(inspectBashCommand('bash -e script.sh').decision).toBe('allow');
  });

  it('allows `bash -- script.sh` (`--` stops option scanning before any -c)', () => {
    expect(inspectBashCommand('bash -- script.sh').decision).toBe('allow');
  });

  it('allows `bash -O extglob script.sh` (value-taking -O consumes its shopt name, still no -c)', () => {
    expect(inspectBashCommand('bash -O extglob script.sh').decision).toBe('allow');
  });

  it('allows `xargs -n 1 echo` (xargs wrapping an innocuous program)', () => {
    expect(inspectBashCommand('xargs -n 1 echo').decision).toBe('allow');
  });

  it('allows `env FOO=1 node app.js`', () => {
    expect(inspectBashCommand('env FOO=1 node app.js').decision).toBe('allow');
  });

  it('allows `timeout 5 npm test`', () => {
    expect(inspectBashCommand('timeout 5 npm test').decision).toBe('allow');
  });

  it('allows a heredoc commit message body that names --no-verify', () => {
    const command = `git commit -F - <<'EOF'\nfix: stop passing --no-verify in CI\nEOF`;
    expect(inspectBashCommand(command).decision).toBe('allow');
  });

  it('allows a plain `git status`', () => {
    expect(inspectBashCommand('git status').decision).toBe('allow');
  });
});

describe('inspector-normalization — wrapper/backslash/quote normalization (DENY)', () => {
  it('denies `bash -c "rm -rf /"` (the pre-existing bash -c gap)', () => {
    const r = inspectBashCommand('bash -c "rm -rf /"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(true);
  });

  it("denies `sh -lc '<git force push>'` (combined -l -c flag cluster)", () => {
    const r = inspectBashCommand("sh -lc 'git push --force origin main'");
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('denies `bash -o pipefail -c "cd x && <git force push>"` (chained tail inside -c body)', () => {
    const r = inspectBashCommand('bash -o pipefail -c "cd x && git push --force origin main"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('denies `env -S "<git force push>"` (split-string value is a command line)', () => {
    const r = inspectBashCommand('env -S "git push --force origin main"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('denies `xargs -I {} <path-form git> status` (xargs -I value flag)', () => {
    const r = inspectBashCommand('xargs -I {} /usr/bin/git status');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-path-invocation')).toBe(true);
  });

  it('denies `\\git push --force` (leading backslash escape)', () => {
    const r = inspectBashCommand('\\git push --force');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('denies `g\\it push --force` (mid-word backslash escape)', () => {
    const r = inspectBashCommand('g\\it push --force');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('denies `"git" push --force` (quoted program word)', () => {
    const r = inspectBashCommand('"git" push --force');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('denies `eval "<git force push>"`', () => {
    const r = inspectBashCommand('eval "git push --force origin main"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('denies `timeout 5 bash -c "<rm -rf />"` (wrapper ahead of the shell)', () => {
    const r = inspectBashCommand('timeout 5 bash -c "rm -rf /"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(true);
  });

  it('denies `nohup sh -c "<git reset --hard>"` (wrapper ahead of the shell)', () => {
    const r = inspectBashCommand('nohup sh -c "git reset --hard HEAD~1"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-reset-hard')).toBe(true);
  });

  it('denies `git branch --del --forc x` (unambiguous long-option abbreviations)', () => {
    const r = inspectBashCommand('git branch --del --forc x');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-branch-force-delete')).toBe(true);
  });

  it('denies nested `bash -c "sh -c \'<rm -rf />\'"` (depth bounded, still denied within MAX_NESTING)', () => {
    const r = inspectBashCommand(`bash -c "sh -c 'rm -rf /'"`);
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(true);
  });
});

describe('inspector-normalization — shell -c option-grammar parsing (DENY)', () => {
  it('denies `bash -c -- "<rm -rf />"` (`-c` then a bare `--` before the body)', () => {
    const r = inspectBashCommand('bash -c -- "rm -rf /"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(true);
  });

  it('denies `bash -c -e "<rm -rf />"` (`-c` then a separate no-value flag before the body)', () => {
    const r = inspectBashCommand('bash -c -e "rm -rf /"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(true);
  });

  it('denies `bash -O extglob -c "<rm -rf />"` (value-taking `-O` consumes its shopt name, then `-c`)', () => {
    const r = inspectBashCommand('bash -O extglob -c "rm -rf /"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(true);
  });

  it('denies `bash --rcfile x -c "<rm -rf />"` (long option `--rcfile` consumes a separate value word)', () => {
    const r = inspectBashCommand('bash --rcfile x -c "rm -rf /"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(true);
  });

  it('denies `bash -o pipefail -c "<git force push>"` (value-taking `-o` consumes its option name, then `-c`)', () => {
    const r = inspectBashCommand('bash -o pipefail -c "git push --force origin main"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('denies `sh -ec "<rm -rf />"` (combined cluster carrying both `e` and `c`)', () => {
    const r = inspectBashCommand('sh -ec "rm -rf /"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(true);
  });
});

describe('inspector-normalization — env -S forms (DENY / ALLOW)', () => {
  it('denies `env -S<cmd>` (attached, no space)', () => {
    const r = inspectBashCommand('env -Sgit\\ push\\ --force\\ origin\\ main');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it("denies `env -S'<cmd>'` (attached, single-quoted)", () => {
    const r = inspectBashCommand("env -S'git push --force origin main'");
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('denies `env --split-string=<cmd>`', () => {
    const r = inspectBashCommand("env --split-string='git push --force origin main'");
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('denies unquoted `env -S git push --force origin main` (value joined with the remaining argv words)', () => {
    const r = inspectBashCommand('env -S git push --force origin main');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-force-push')).toBe(true);
  });

  it('allows `env -S "npm test"`', () => {
    expect(inspectBashCommand('env -S "npm test"').decision).toBe('allow');
  });
});

describe('inspector-normalization — git-branch-force-delete abbreviation ambiguity', () => {
  it('denies `git branch --del --forc x` (both abbreviations at their unambiguous minimum length)', () => {
    const r = inspectBashCommand('git branch --del --forc x');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-branch-force-delete')).toBe(true);
  });

  it('allows `git branch --del --for x` (`--for` alone is ambiguous with `--format`, so it does not count as force)', () => {
    const r = inspectBashCommand('git branch --del --for x');
    expect(r.hits.some((h) => h.ruleId === 'git-branch-force-delete')).toBe(false);
    expect(r.decision).toBe('allow');
  });
});

describe('inspector-normalization — nesting bound (fail-closed)', () => {
  // MAX_NESTING is 4 (src/lib/ast/inspect.ts, not exported — pinned here by
  // its observable boundary instead of importing the constant).

  it('the last allowed depth (MAX_NESTING = 4): still denies a dangerous command nested exactly at the bound, inspected on its own merits, not on nesting-too-deep', () => {
    const command = wrapShellC('rm -rf /', 4);
    const r = inspectBashCommand(command);
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(true);
    expect(r.hits.some((h) => h.ruleId === 'nesting-too-deep')).toBe(false);
  });

  it('the first denied depth (MAX_NESTING + 1 = 5): fails closed on depth alone, before the dangerous inner command is ever reached', () => {
    const command = wrapShellC('rm -rf /', 5);
    const r = inspectBashCommand(command);
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'nesting-too-deep')).toBe(true);
    // The inner `rm -rf /` is never actually inspected at this depth: only
    // the depth-bound rule fired, not rm-recursive-force.
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(false);
    expect(r.reason).toContain('command nesting too deep to inspect');
  });

  it('denies with a clear reason when nesting exceeds the bound, even for a plain inner command', () => {
    const command = wrapShellC('echo hi', 6);
    const r = inspectBashCommand(command);
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'nesting-too-deep')).toBe(true);
    expect(r.reason).toContain('command nesting too deep to inspect');
  });

  it('applies the same fail-closed depth bound to substitution-only nesting (no shell -c hand-off involved): 5 nested $(...) around a harmless command still denies', () => {
    const command = wrapSubstitution('echo hi', 5);
    const r = inspectBashCommand(command);
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'nesting-too-deep')).toBe(true);
    // Nothing else about `echo hi` is dangerous — the only reason this
    // denies is the unreached depth, not command content.
    expect(r.hits.every((h) => h.ruleId === 'nesting-too-deep')).toBe(true);
  });
});

describe('inspector-normalization — existing behavior preserved', () => {
  it('still allows a git commit message mentioning `rm -rf` as text', () => {
    expect(
      inspectBashCommand('git commit -m "Document the rm -rf pattern detection"').decision,
    ).toBe('allow');
  });

  it('still allows a git commit message mentioning `--no-verify` as text', () => {
    expect(inspectBashCommand('git commit -m "Block --no-verify via the AST hook"').decision).toBe(
      'allow',
    );
  });

  it('still allows a quoted mention of the bypass-token filename in prose', () => {
    expect(inspectBashCommand('echo "please avoid any bypass token here"').decision).toBe('allow');
  });

  it('still denies plain `sh -c "/usr/bin/git status"` via git-path-invocation', () => {
    const r = inspectBashCommand('sh -c "/usr/bin/git status"');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-path-invocation')).toBe(true);
  });

  it('still allows plain `git push origin main` (no force)', () => {
    expect(inspectBashCommand('git push origin main').decision).toBe('allow');
  });
});
