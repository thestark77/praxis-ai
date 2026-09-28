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
- `env -S`'s split-string value is reconstructed by tokenising and
  rejoining argv words with a single space, not by re-deriving the
  shell's own quoting/escaping rules for that value; unusual internal
  quoting inside the split string beyond ordinary whitespace-separated
  words is not specially modeled.

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
`-c` in isolation. `env -S`'s value is recognized in every spelling —
attached (`-S<cmd>`, `-S'<cmd>'`), `--split-string=<cmd>`, and the
separate-word form — and in the unquoted separate-word form the nested
command is the `-S` value joined with whatever argv words follow it,
matching how `env` itself appends trailing arguments to the split
command.

`git-branch-force-delete` also accepts git's own unambiguous long-option
abbreviations, but the two flags need different minimum lengths to reach
that point: `--delete` has no other `git branch` long option sharing a
prefix with it, so `--del` (5 characters) onward is accepted, while
`--force` shares its first four characters with `--format` (`--for` is
genuinely ambiguous between the two) — only `--forc` (6 characters) and
the full `--force` are accepted.

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
