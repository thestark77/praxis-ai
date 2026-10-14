# Irreversibility firewall

praxis-ai's irreversibility containment is a two-layer system. Both
layers are always active when praxis is installed; they catch
overlapping but not identical sets of dangerous actions, and the order
in which they fire is determined by Claude Code, not by praxis-ai.

For Bash tool calls, the AST PreToolUse hook fires first because Claude
Code runs `PreToolUse` hooks before the permission check. If the hook
returns `deny`, the tool is blocked and the deny list is never consulted
for that call. If the hook returns `allow`, the deny list is then
evaluated. The deny list is the fallback for the case where the hook
crashes or fails open, and it is the primary enforcer for non-Bash
tool calls (where the AST hook is not invoked).

## Layer 1 — regex deny list

`praxis install` appends ~30 entries to `settings.json` under
`permissions.deny`. They use Claude Code's permission-pattern syntax
(`Bash(<glob>)`, `Read(<path>)`, etc.). When a tool call matches an
entry, Claude Code blocks it at the permission layer before any tool
executes.

Categories covered (see [`src/data/firewall-defaults.ts`](../src/data/firewall-defaults.ts)):

- **Filesystem destructive** — `rm -rf`, `rm -fr`, `find -delete`
- **Git destructive** — `git push --force*`, `git push -f`,
  `git push --force-with-lease`, `git reset --hard`, `git checkout --`,
  `git clean -f`, `git branch -D`
- **History rewrite** — `git commit --amend` against published commits
  (heuristic), `git rebase -i`
- **Hook / signing bypass** — `--no-verify`, `--no-gpg-sign`
- **Secrets paths** — `Read(.env)`, `Read(.env.*)`,
  `Read(*/credentials*)`, `Read(*/.aws/*)`, `Read(**/bypass.token)`,
  `Read(**/*bypass*.token)`
- **Block device / format** — `Bash(dd of=/dev/sd*)`,
  `Bash(mkfs*)`, `Bash(wipefs*)`, `Bash(shred*)`
- **Privilege escalation** — `Bash(sudo *)`, `Bash(doas *)`

Layer 1 is fast but conservative: it cannot inspect intent, only
patterns. It is also bypassable by anything that hides the dangerous
operation inside an encoded payload, a substitution, or a command
chain that pattern-matches differently.

## Layer 2 — AST PreToolUse hook

`praxis-ast-hook` is registered as a Claude Code `PreToolUse` hook on
the `Bash` matcher during `praxis install`. For every Bash tool call,
the hook receives a JSON event over stdin and emits a decision JSON
over stdout.

The hook walks each command via the praxis bash tokeniser
(`src/lib/ast/tokeniser.ts`). The tokeniser is quote-aware and
substitution-aware: `;`, `&&`, `||`, `|`, `&` inside single or double
quotes do not split, and `$(...)` / backtick bodies are extracted for
separate inspection.

Each token (and the original full string, and each substitution body)
is then run against the rule set in `src/lib/ast/rules.ts`. This table
also backfills eight rules (`chmod-recursive-permissive` through
`npm-install-force` below) that existed in the code before they were
ever listed here, alongside the three added for guard-evasion coverage.

| Rule ID | Reversibility class | Pattern |
|---|---|---|
| `rm-recursive-force` | data-loss | `rm` with both `-r`/`-R`/`--recursive` AND `-f`/`--force` |
| `find-delete` | data-loss | `find ... -delete` or `find ... -exec rm` |
| `git-force-push` | history-rewrite | `git push --force` / `-f` / `--force-with-lease` |
| `git-reset-hard` | data-loss | `git reset --hard` |
| `no-verify` | exec-bypass | `--no-verify` or `--no-gpg-sign` |
| `sudo-escalation` | sudo-escalation | `sudo` or `doas` as the first token |
| `encoded-execution` | exec-bypass | `base64`/`base32`/`xxd`/`openssl` paired with `sh`/`bash`/`exec`/`eval`; hex-printf-to-shell |
| `dd-block-device` | data-loss | `dd of=/dev/(sd|nvme|hd|disk)` |
| `mkfs` | data-loss | `mkfs*`, `wipefs`, `shred` |
| `chmod-recursive-permissive` | data-loss | `chmod -R` to a world-writable mode (777, 666, `a+w`, ...) |
| `chown-recursive` | data-loss | `chown -R` against `/`, `/usr`, `/etc`, `/var` |
| `tar-absolute-names` | data-loss | `tar -x --absolute-names` / `-xP` (path-traversal extraction) |
| `curl-pipe-shell` | exec-bypass | `curl`/`wget`/`fetch` piped into a shell |
| `pip-install-target-root` | data-loss | `pip install --target /`, `/usr`, `/etc` |
| `git-update-ref` | history-rewrite | `git update-ref` against `refs/heads/*` or `refs/tags/*` |
| `git-filter-branch` | history-rewrite | any `git filter-branch` invocation |
| `npm-install-force` | exec-bypass | `npm`/`pnpm`/`yarn` install with `--force`/`-f` |
| `git-branch-force-delete` | delete | `git branch -D`, or `-d`/`--delete` combined with `-f`/`--force` (including combined flags like `-df`); plain `-d` stays allowed. Resolves git through the same wrapper/env/path-form detection as `git-path-invocation` (`env`, `GIT_DIR=...`, a path-form `git`, ...) and walks past git's own global options (`-C`, `-c`, `--git-dir`, `--work-tree`, `--namespace`) before looking for `branch`. Unlike `git-path-invocation`, it does **not** follow a `sh -c`/`bash -c` body — `sh -c "git branch -D x"` is not resolved through this rule |
| `git-path-invocation` | guard-evasion | `git` invoked via an absolute or relative path (`/usr/bin/git`, `./git`, `~/bin/git`) instead of the bare `git` on PATH — routes around a shim. Also resolves through `env`/`timeout`/`stdbuf`/`setsid`/`xargs`/... wrappers, matched by basename so a path-form wrapper (`/usr/bin/env`) is recognised too (including `env`'s `-u`/`-C`/`-S` value flags), and up to `MAX_SHELL_C_DEPTH` (3) levels of nested `sh -c "..."` / `bash -c '...'` bodies — only ever inspecting the first command of each body, not a `&&`/`;`-chained tail |
| `read-bypass-token` | secrets | any command referencing a path whose basename contains `bypass` AND ends with the literal `.token` extension (e.g. `~/.local/state/iris-worktrees/bypass.token`), across readers, copiers, encoders, `<` redirection, and `--opt=<path>` values. Inspects quoted content too (`cat "$HOME/.../bypass.token"`), splitting it on whitespace so quoted prose ("bypass token" as two words) still passes. This is a literal-name check: a glob that avoids spelling the words out (e.g. `by*`), or a name built from quote-concatenated or otherwise obfuscated fragments that never appear as one literal word, cannot be caught by this syntactic check |

The hook returns `deny` with a human-readable reason listing every
rule that hit and its reversibility class. The reason text is the same
text Claude sees, so the agent gets explicit guidance about why the
command was blocked and what reversibility class applies.

## Narrow exception — `rm` of the session's own temporary files

Owner decision (2026-10-13): an unattended session must be able to delete
its own temporary files without a prompt.

Claude Code asks before some `rm` commands on its own, most often a
`bash -c` script it cannot parse (*"This shell -c script runs rm and could
not be checked"*). That ask is a built-in safety check, not a praxis rule:
a PreToolUse `allow` does not answer it (verified against Claude Code
2.1.299), so with nobody at the keyboard it auto-denies after a timeout and
the session stalls. Only a `PermissionRequest` hook can answer it, so
`praxis install` also registers `praxis-ast-hook` for `PermissionRequest`
on the `Bash` matcher. On that event the hook answers `allow` only when
`src/lib/ast/safe-rm.ts` proves all of the following, and otherwise prints
nothing, so the prompt is shown exactly as before:

- the command passes every Layer 2 rule above;
- the command is built only from `rm`, `echo`, `printf`, `true`, `:`, nested
  `sh -c`/`bash -c` scripts (up to 3 levels), `for NAME in WORDS; do ...;
  done` over literal words, the `;` `&&` `||` newline separators, and output
  sent to `/dev/null` or `2>&1`;
- every `rm` has no flag other than `-v` and `--` (so no `-r`, `-R`, `-f`,
  `-d`, `-i`, `--recursive`, `--force`, in any spelling or combination);
- every target is a literal path (no glob, brace expansion, `$VAR` other
  than the loop variable, `$(...)` or backticks) naming an existing file or
  symlink, not a directory, outside any `.git` directory, that resolves with
  `realpath(3)` (symlinks and `..` resolved as the kernel does) inside
  either the git worktree that contains the session's `cwd`, when that
  worktree sits under `~/worktrees/`, or a `/tmp/claude-*/` directory owned
  by the current user; a symlink target must resolve inside them too.

Still prompted (never auto-approved): `rm -rf` and every recursive or force
spelling (which Layer 1 and `rm-recursive-force` also deny), `sudo rm`, any
path outside those roots (including another worktree), a directory, a file
that does not exist, and anything the hook cannot resolve statically. The
hook never denies on this event and never deletes anything itself. Claude
Code's deny rules are evaluated before `PermissionRequest`, so this
exception cannot override Layer 1. The blanket switch
`CLAUDE_CODE_DISABLE_INLINE_SHELL_RM_PROMPT` is deliberately not used: it
would drop the check for every path.

## Fail-open policy

If the hook receives malformed input or otherwise crashes, it emits an
`allow` decision. **Layer 1 remains the floor.** The AST hook is
defence in depth — it must not become a single point of failure that
blocks legitimate work when its own machinery is broken.

## What the firewall does NOT do

- It does not block irreversible operations the model is **asked** to
  perform by the user. Confirmation is the user's responsibility once
  they explicitly authorise.
- It does not run code in a sandbox. It inspects command strings and
  decides allow/deny. The decision is final at the Claude Code permission
  layer; the command itself never reaches the shell when denied.
- It does not exhaustively cover every dangerous Unix command. The rule
  set is opinionated — see `~/.praxis/irreversibility-firewall.md` for
  the broader anticipatory-pause protocol the model also follows.

### Known limits

- `read-bypass-token` is a literal-name check: a quote-concatenated or
  glob-obfuscated name that never appears as one literal word (e.g.
  `"byp"'ass.to'"ken"`) evades it. A glob that avoids spelling a name at
  all (`by*` expanding to the token file) is invisible to any syntactic
  check for the same reason.
- A variable expanded only at runtime (`$G push --force`, where `$G` is
  set to `git` earlier in the session) is opaque to a static inspector —
  the hook sees the literal text `$G`, not what the shell will substitute.
- An alias or shell function defined earlier in the same session (e.g.
  `alias g=git`) redefines what a bare word runs; the hook has no
  visibility into session-local alias/function tables, only the command
  string itself.
- The shell `-c` option-grammar parser (`findShellCArgument`) models
  `sh`/`bash`/`zsh`/`dash`/`ksh` conventions: leading `-`/`+` clusters,
  long `--opt` options, and the value-taking flags those shells define
  (`-o`/`+o`, `-O`/`+O`, `--rcfile`/`--init-file`). A shell outside that
  fixed set (fish, csh, tcsh, PowerShell, ...) is not recognized as a
  `-c` hand-off at all, so its own — possibly different — option grammar
  is never modeled; a dangerous body passed through one of those shells'
  `-c` equivalent is inspected only as an opaque argument to an unknown
  program, the same as any other unrecognized command.
- `env -S`'s split-string value itself is inserted verbatim into the
  reconstructed command, not re-derived from the shell's own
  quoting/escaping rules for that value; only the trailing argv words
  appended after it (the separate-word form's `<rest...>`) are
  individually shell-quoted when rebuilt. Unusual internal quoting inside
  the split-string value beyond ordinary whitespace-separated words is
  not specially modeled.

The inspector (`src/lib/ast/inspect.ts`) normalizes every command segment
before running rules against it — stripping `VAR=value` assignments and
wrapper prefixes (`env`, `command`, `exec`, `nohup`, `nice`, `time`,
`timeout`, `stdbuf`, `setsid`, `xargs`, matched by basename so a path-form
wrapper counts too), and unquoting/unescaping the resolved program word
(`\git`, `g\it`, `"git"`, `'git'` all normalize to `git`) — and enqueues a
shell's `-c` body, `eval`'s arguments, and `env -S`'s split-string value
for full re-inspection (tokenising, segment splitting, substitutions,
normalization, every rule), bounded by the same nesting cap as command
substitutions and heredocs. This closes the gaps `env -S`, `bash -lc`, and
`xargs -I {}` used to leave open for `git-path-invocation` and
`git-branch-force-delete`, the chained-`sh -c "a && git ..."` tail gap,
and a pre-existing hole where `bash -c "rm -rf /"` evaded every rule
because the `-c` body was never re-inspected at all. Nesting beyond the
cap fails closed: the inspector denies with "command nesting too deep to
inspect" rather than silently allowing content it never actually looked
at — this applies equally to a chain of shell `-c` hand-offs and to plain
command-substitution nesting (`$(...)`) with no shell hand-off involved at
all; either shape denies once the bound is crossed, regardless of how
harmless the unreached innermost command actually is.

The `-c`-body detector (`findShellCArgument`) walks the shell's own
leading-option grammar instead of a single-flag heuristic: it scans
`-`/`+` clusters and long `--opt` options, consumes the value word of
`-o`/`+o`, `-O`/`+O`, and `--rcfile`/`--init-file` (the attached
`--rcfile=x` form needs no extra word), and stops at a bare `--` or the
first non-option word. If any cluster scanned contained the letter `c`,
the first non-option word reached is treated as the `-c` body — covering
`bash -c -- "..."`, `bash -c -e "..."`, `bash -O extglob -c "..."`,
`bash --rcfile x -c "..."`, and `sh -ec "..."` alike, not just a bare
`-c` in isolation. `env -S`'s value is recognized in exactly these
spellings: the short flag with a separate-word value (`-S <cmd>`),
attached (`-S<cmd>`, `-S'<cmd>'`), inside a combined short-option cluster
(`-iS<cmd>`, `-iS'<cmd>'`, `-iS <cmd>` — GNU `env` has no other short
option spelled with a capital `S`, so any cluster carrying one is
unambiguous), the exact long option (`--split-string <cmd>`,
`--split-string=<cmd>`), and any unambiguous abbreviation of the long
option down to `--s` (GNU `env` has no other long option starting with
`s`), both as `--sp=<cmd>` and as `--sp <cmd>`. In every separate-word
form the nested command is the `-S` value joined with whatever argv words
follow it, matching how `env` itself appends trailing arguments to the
split command — each of those trailing words is individually
shell-quoted before being rejoined, so a quoted argv word (e.g. a commit
message containing `--no-verify` as prose) is not flattened into bare
text and re-split into a standalone, dangerous-looking token. The `-S`
value itself is still inserted verbatim, not re-derived from the shell's
own quoting rules — see Known limits below.

`git-branch-force-delete` also accepts git's own unambiguous long-option
abbreviations, but the two flags need different minimum lengths to reach
that point: `--delete` has no other `git branch` long option sharing a
prefix with it, so `--del` (5 characters) onward is accepted, while
`--force` shares its first four characters with `--format` (`--for` is
genuinely ambiguous between the two) — only `--forc` (6 characters) and
the full `--force` are accepted. It also matches its program word by
basename, the same as `git-path-invocation`, so a path-form force-delete
(`/usr/bin/git branch -D x`) is caught by both rules at once.

## Customisation

Users override the deny list by adding entries to `settings.json`
before `praxis install` — praxis preserves user entries and appends
its own. To suppress a praxis entry, edit `settings.json` after
install (the entries are plain strings; the praxis install does not
re-add removed entries unless `praxis install --force` is run).

The AST hook is opt-out via uninstall: `praxis uninstall` removes the
hook entry; `praxis uninstall --keep-skeleton --keep-skills` removes
the hook + firewall but keeps `~/.praxis/` and the lifted skills.

## Tracking

When the hook denies, the event is recorded as a `deny_hit` in the
telemetry DB so `praxis stats` can surface aggregate counts. The hook
emits its decision FIRST and only then attempts the telemetry write,
which is best-effort: any failure opening or writing
`~/.praxis/telemetry.db` is swallowed so the hook never turns a deny
into an allow when its own machinery breaks.

Telemetry can be suppressed per-invocation with the
`PRAXIS_TELEMETRY_DISABLED=1` environment variable.

## Performance

`scripts/bench-hook.sh` times the hook over N invocations across four
paths. CI runs the bench on every matrix cell so cross-platform numbers
ship on every push.

### Cross-platform per-invocation latency (ms, alpha.5 CI run, N=30)

| Path | ubuntu-18 | ubuntu-20 | ubuntu-22 | macos-18 | macos-20 | macos-22 |
|------|-----------|-----------|-----------|----------|----------|----------|
| Allow (cold) | 55.6 | 49.6 | **42.3** | 58.6 | 45.3 | **44.1** |
| Allow (warm) | 55.1 | 49.6 | **41.6** | 57.5 | 60.2 | **46.5** |
| Deny + telemetry | 60.3 | 54.9 | **45.8** | 66.2 | 62.6 | **47.8** |
| Deny, no telemetry | 54.2 | 49.9 | **40.5** | 56.2 | 51.8 | **49.7** |

Bold = current minimum per platform. Patterns:

- The dominant cost is Node startup (V8 init, ESM module graph). Rule
  evaluation itself is sub-millisecond.
- Newer Node is faster. Node 22 is ~25 % faster than Node 18.
- macOS is comparable to ubuntu on Node 22; slightly slower on older
  Node.
- The deny path costs an extra 5–10 ms over allow because of the
  SQLite open + insert + close cycle. `PRAXIS_TELEMETRY_DISABLED=1`
  brings it back down to allow-path territory.

For most workloads this is acceptable because the hook only fires on
Bash invocations (not Read, Edit, Grep, etc.) and most Bash invocations
are short-lived themselves. If you are sensitive to per-call latency on
very hot loops, set `PRAXIS_TELEMETRY_DISABLED=1`.

A future optimisation could move the hook to a long-lived daemon
listening on a Unix socket, paid for by eliminating per-call Node
startup. That is a v0.2+ consideration; the current dispatch model is
chosen for simplicity and zero background processes.

Run locally with `pnpm run bench:hook [N]` (default N=50). Look for
`BENCH:<path>:n=<n>:total_ms=<>:per_ms=<>` lines for machine-readable
output.

## Verification

After install, run `praxis doctor --verify` to spawn the registered
hook with a synthetic `rm -rf` payload and assert that it returns a
deny decision. Useful as a smoke test before relying on the firewall
in a new environment.
