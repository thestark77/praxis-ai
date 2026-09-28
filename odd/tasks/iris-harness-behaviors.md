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

- [ ] T1 `queue-rule` — "queue, don't preempt" module
  (`templates/praxis-home/queue-rule.md`, imported from `main.md`), plus a
  test that every `@import` in `main.md` resolves to a template file.
  Route: delegated writer (2+ non-trivial files).
  Follow-up (Iris session, not Praxis): retire Iris's own queue-rule block
  (`iris-ai hermes/harness-rules/queue-rule.md`) once Praxis ships it.
- [ ] T2 `context-budget` — replace the 75% warning with a poll
  (AskUserQuestion) between 50% and 60% at a clean point, never mid-task;
  on "yes" save progress (Engram, memory, task docs, running subagents),
  stop and wait for the user to compact. Document the context-guard
  protocol (`[IRIS CONTEXT GUARD] prepare-compact handoff=<path>` →
  `COMPACT-READY <path>`; `restore handoff=<path>` → `CONTEXT-RESTORED`).
  Route: delegated writer.
- [ ] T3 `command-handoff` — commands handed to the user use absolute paths
  and secret placeholders (`PEGA_AQUI_TU_API_KEY`); never print or read
  secrets. Route: delegated writer.
- [ ] T4 `firewall-shim-bypass` — never invoke git by absolute path to evade
  a shim; never read bypass tokens (e.g.
  `~/.local/state/iris-worktrees/bypass.token`); delete branches with `-d`
  after verifying the merge, never `-D`. Layer 1 deny entries + Layer 2 AST
  rules + protocol text. Route: delegated writer.
- [ ] T5 `workflow-policy` — workflows only when pertinent (independent
  batches), one task per worktree, disjoint files with a single owner per
  shared file, workflows never deliver (no push/merge/deploy), at most 4
  concurrent code writers, size set per session by the prompt.
  Route: delegated writer.
- [ ] T6 `effort-policy` — docs-verified effort guidance (see evidence).
  Route: delegated writer.

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

- 2026-09-28: feature document created; T1 started.
- 2026-09-28: T1 implemented (delegated writer, worktree
  `~/worktrees/praxis-ai/queue-rule`, branch `feat/queue-rule`). Added
  `templates/praxis-home/queue-rule.md`, imported it from `main.md` (after
  `phase-flow.md`), and added `tests/lib/praxis-home-modules.test.ts` (a
  durable guard: every `@`-import in `main.md` resolves to an existing
  template file, `main.md` imports `queue-rule.md`, and `queue-rule.md`
  contains the key clauses/exception trigger words). Also added a
  `queue-rule.md` check to the existing bundled-templates integration test
  in `tests/lib/skeleton-installer.test.ts`. Updated `docs/architecture.md`
  (`~/.praxis/` tree) and `CHANGELOG.md` (new `[Unreleased]` section).
  Strict TDD observed: RED — 2 of 3 new tests failing (`queue-rule.md` not
  found / not imported); GREEN — same tests plus the full suite passing
  after implementation. Verification: `pnpm test` PASS, `pnpm typecheck`
  PASS, `pnpm lint` PASS, `pnpm format:check` PASS. Committed on `feat/queue-rule` (T1 stays unchecked pending merge +
  native review, per acceptance criteria).

## Next step

T1.
