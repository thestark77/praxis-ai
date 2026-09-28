# Feature: harness-wide behaviors from the Iris session

## Objective

Move six user-wide agent behaviors, first built in the Iris session, into the
Praxis overlay so every harness session inherits them.

## Problem / why

These behaviors apply to every harness the user runs, not only Iris. Praxis
owns task startup, the firewall, the context budget and precedence, so it is
their natural home. Source: Engram `praxis/backlog/from-iris-session` (#1828)
and `praxis/session/iris-backlog-kickoff` (#1830).

## Scope

In: `templates/praxis-home/*` modules, `src/cli/context-usage.ts`, the
firewall (`src/data/firewall-defaults.ts`, `src/lib/ast/rules.ts`), docs,
tests, CHANGELOG.

Out: iris-ai (never touched from Praxis), persona/voice (gentle-ai owns it),
the Iris-specific decision-model evaluation.

## Constraints

- All writes in worktrees `~/worktrees/praxis-ai/<task>`; the main checkout
  keeps an unrelated `.engram/config.json` change untouched.
- Strict TDD with the repo's vitest (source: user kickoff prompt; runner:
  `pnpm exec vitest run <file>`, full `pnpm test` builds first).
- Conventional Commits, no AI attribution.
- One PR per task; merge only after native gentle-ai review is approved and
  acknowledged.
- Delivery strategy: `single-pr` per task (each task is well under ~400
  authored lines).

## Tasks

- [x] T1 `queue-rule` — "queue, don't preempt" module
  (`templates/praxis-home/queue-rule.md`, imported from `main.md`), plus a
  test that every `@import` in `main.md` resolves to a template file.
  Route: delegated writer (2+ non-trivial files).
  Follow-up (Iris session, not Praxis): retire Iris's own queue-rule block
  (`iris-ai hermes/harness-rules/queue-rule.md`) once Praxis ships it.
- [x] T2 `context-budget` — replace the 75% warning with a poll
  (AskUserQuestion) between 50% and 60% at a clean point, never mid-task;
  on "yes" save progress (Engram, memory, task docs, running subagents),
  stop and wait for the user to compact. Document the context-guard
  protocol (`[IRIS CONTEXT GUARD] prepare-compact handoff=<path>` →
  `COMPACT-READY <path>`; `restore handoff=<path>` → `CONTEXT-RESTORED`).
  Route: delegated writer.
- [x] T3 `command-handoff` — commands handed to the user use absolute paths
  and secret placeholders (`PEGA_AQUI_TU_API_KEY`); never print or read
  secrets. Route: delegated writer.
- [x] T4 `firewall-shim-bypass` — never invoke git by absolute path to evade
  a shim; never read bypass tokens (e.g.
  `~/.local/state/iris-worktrees/bypass.token`); delete branches with `-d`
  after verifying the merge, never `-D`. Layer 1 deny entries + Layer 2 AST
  rules + protocol text. Route: delegated writer.
- [x] T5 `workflow-policy` — workflows only when pertinent (independent
  batches), one task per worktree, disjoint files with a single owner per
  shared file, workflows never deliver (no push/merge/deploy), at most 4
  concurrent code writers, size set per session by the prompt.
  Route: delegated writer.
- [x] T6 `effort-policy` — docs-verified effort guidance (see evidence).
  Route: delegated writer.

- [ ] T7 `inspector-normalization` (approved by the user 2026-09-28
  (relayed by the Iris session)) — move wrapper/env-assignment/`sh -c`
  normalization from individual rules into the AST inspector
  (`src/lib/ast/inspect.ts`) so every rule sees the effective command.
  Closes the T4 known limits (`env -S`, `bash -lc`, `xargs -I {}`,
  chained `sh -c` bodies, backslash escapes) and a pre-existing gap:
  `bash -c "rm -rf /"` evades every rule today.
  Route: delegated writer, branch `feat/inspector-normalization`, in a
  dedicated worktree.
  Progress: implemented — `normalizeSegment`/`extractNestedCommand`
  added to `src/lib/ast/rules.ts` (wrapper/VAR=/backslash/quote
  normalization once, ahead of every rule; shell `-c`, `eval`, and
  `env -S` bodies enqueued into the inspector's worklist for full
  re-inspection); `inspect.ts` runs every rule against both the raw and
  normalized segment and fails closed ("command nesting too deep to
  inspect") past the existing nesting bound; `git-path-invocation` and
  `git-branch-force-delete` simplified to rely on the normalized segment
  instead of their own wrapper-walking; `git-branch-force-delete` also
  accepts unambiguous long-option abbreviations. New test file
  `tests/lib/ast/inspector-normalization.test.ts` (TDD: RED observed
  before implementation, GREEN after). Full suite green
  (`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`).
  Found and fixed, in the same change, a real evasion-class bug in the
  pre-existing `argv()` parser: it mishandled the standard shell `'\''`
  quote-escape idiom outside of quotes, which could turn a `deny` into an
  `allow` for a sufficiently obfuscated nested `bash -c` chain. A
  follow-up scoped correction then matched `git-branch-force-delete`'s
  program word by basename (path-form force-delete now hits both
  `git-path-invocation` and `git-branch-force-delete`), recognized the
  remaining `env -S` spellings (a short-option cluster carrying `S`, and
  unambiguous long-option abbreviations of `--split-string`), and
  shell-quoted the separate-word form's trailing argv words so a quoted
  word is not flattened and re-split into a false-positive token. Not
  pushed, no PR opened. Status: implemented on
  `feat/inspector-normalization`, in review.
- [x] T8 `away-mode` — explicit skill for unattended sessions (Iris backlog
  item #1836, topic `praxis/backlog/away-mode`): readiness checks and flags
  (herdr, `cc-flags` auto_compact/auto_resume, context guard, review
  consent, `cc-status`), workflow sizing, blocker sweep before leaving,
  overnight rules, exact `/loop` command, return summary. Must be tested
  live. Route: delegated writer, branch `feat/away-mode`.

- [x] T9 `upstream-first-debugging` — new module: when a third-party
  open-source tool fails or misbehaves and the cause isn't obvious, check
  its source repo first (search open AND closed issues/PRs, find the
  canonical fix, check with `git merge-base --is-ancestor` whether the
  installed version has it) before local workarounds or deep local
  debugging; filing or commenting upstream is an external send needing the
  user's explicit OK first. Source: Iris session relay of a user request,
  2026-09-28. Route: delegated writer.

## Acceptance criteria

- Each behavior is an installed `~/.praxis/` module (or an edit of an
  existing one) imported from `main.md`, covered by tests.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` pass.
- Each PR merged after an approved, acknowledged native review.

## Evidence

- T6 effort (Anthropic model-migration guide bundled with the claude-api
  skill, section "Migrating to Claude Opus 5.5"; live source
  https://platform.claude.com/docs/en/build-with-claude/effort.md): the API
  default for Opus 5.5 is `medium` (Opus 5 and earlier default to `high`);
  "Claude Opus 5.5 at `medium` exceeds Claude Opus 5 at `high` on coding and
  knowledge-work evaluations"; "reserve `xhigh` and `max` for work where you
  have measured a quality gain"; `max` "can be prone to overthinking".

## Progress

Delivery, one PR per task, each merged after an approved and acknowledged
native gentle-ai review plus green CI (merge commits, so merged branches are
deleted with `git branch -d`):

| Task | PR | Review rounds | Notes |
| --- | --- | --- | --- |
| T1 queue-rule | #14 | 1 | Adds the `main.md` import-resolution guard test |
| T3 command-handoff | #15 | 2 | Round 1 led to a POSIX-portable secret prompt |
| T5 workflow-policy | #16 | 2 | Round 1 led to rule-body assertions |
| T6 effort-policy | #17 | 1 | Claims trimmed to the documented evidence |
| T2 context-budget | #18 | 4 | Trust boundary, failure replies, poll policy, rounding |
| T4 firewall-shim-bypass | #19 | 4 | Retry cap reached; remaining variants documented as known limits, durable fix proposed as T7 |
| T8 away-mode | #21 | 3 | Live-tested `/away-mode check`; remaining follow-ups: native-skill ownership fail-open when SKILL.md missing, orphaned partial dir |
| T9 upstream-first-debugging | #22 | 3 | Rounds 1-2 fixed an invalid `gh search issues --state all` and unscoped `gh ... list` commands, pinned by tests |

Verification on each merged branch: `pnpm test`, `pnpm typecheck`,
`pnpm lint`, `pnpm format:check` passing (main after #22: 749 tests).

Open follow-ups (non-blocking review suggestions):

- `command-handoff.md`: restore the terminal if the `stty -echo` prompt is
  interrupted; mention `export` when the variable must reach child processes.
- Module tests could assert install-level presence (installer output), not
  only the template tree.
- `context-budget.md`: define "session phase"; a controller that predates
  the failure replies only understands the success strings.
- Iris session: retire Iris's own queue-rule block and its local
  upstream-first memory rule once the release carrying these modules is
  installed (`praxis update`); adopt the optional
  `COMPACT-FAILED <path|-> <reason>` / `RESTORE-FAILED <reason>` replies.

## Next step

T7 waits for the user's decision (relayed by the Iris session). If approved,
implement T7, then prepare the v0.1.0-alpha.28 release PR (version bump in
`package.json`, `src/cli/index.ts` and tests, CHANGELOG) so one release
carries #14-#22 plus T7; the user triggers `gh release create`.
