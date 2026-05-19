# Irreversibility firewall

praxis-ai's irreversibility containment is a two-layer system. Layer 1
is fast, declarative, and easy to audit. Layer 2 is the second line of
defence against creative bypasses Layer 1 silently misses.

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
  `Read(*/credentials*)`, `Read(*/.aws/*)`
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
is then run against the rule set in `src/lib/ast/rules.ts`:

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

When the hook denies, the event will be recorded as a `deny_hit` in
the telemetry DB so `praxis stats` can surface aggregate counts. The
hook → telemetry tie-in lands in M3.5 (v0.2). Until then `praxis stats`
shows zero `deny_hits` even when the hook is actively blocking; check
the Claude Code session transcript for the deny reasons in the
meantime.
