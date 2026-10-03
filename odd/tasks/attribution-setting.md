# ODD feature: attribution-setting (SEB-21, slice 1)

## Objective
Make "no AI attribution" deterministic: `praxis install` sets Claude Code's
`attribution` setting to empty strings in the user settings file, so Claude Code never
adds `Co-Authored-By: Claude` to commits or "Generated with Claude Code" to PRs.

## Problem
The rule lives only as text in CLAUDE.md. Evidence: 65 historical iris-ai commits carry
`Co-Authored-By: Claude`, and PR descriptions on 2026-10-03 still got the line.
Owner decision (2026-10-03): deterministic, empty for commits and PRs.

## Scope (authorized)
- `praxis install` (and `update`) write `attribution: { commit: "", pr: "" }` into
  `~/.claude/settings.json` with the existing key-level settings patcher: preserve
  every other key, idempotent, recorded so `uninstall`/`rollback` restore the previous
  value (follow how the patcher already handles its managed keys).
- `praxis doctor` reports the setting's state.
- Docs: README/CHANGELOG `[Unreleased]` entry.

## Constraints
- Strict TDD (source: owner global config "Strict TDD Mode: enabled"); runner
  `pnpm test` (single file `pnpm exec vitest run <path>`).
- No new dependency. Never remove or rewrite unrelated settings keys.

## Tasks
- [x] T1 — Installer + doctor + uninstall/rollback + tests + docs. Route: delegated
  writer (reads settings-patcher, install, update, uninstall, rollback, doctor first).
  Trigger evidence: 12 files across patcher, ledger, installer, CLI, tests and docs.
  Commit: `feat(install): enforce empty Claude Code attribution in user settings`
  (a commit cannot hold its own hash; read it from `git log`).

## Acceptance criteria
- Tests: fresh settings, existing settings with other keys, an existing different
  `attribution` value (owner's value is overwritten only by `--force`? follow the
  patcher's existing policy for managed keys and document it), idempotent re-run,
  uninstall restores.
- `pnpm test` and `pnpm typecheck` green.

## Design decisions (T1)
- **Overwrite policy: a pre-existing different `attribution` is kept unless
  `praxis install --force`.** Precedent: `runInstall` passes `overwrite: opts.force` for
  the skeleton and the Claude skills (`src/lib/install.ts`, `installSkeleton` and
  `installClaudeSkills` calls), and the ownership ledger principle that praxis never
  claims or removes what it did not write (`src/lib/ownership.ts` header). The deny
  list is additive and the AST hook replaces only its own marker-tagged entry, so
  neither has a "different user value" case to mirror; `--force` is the only
  existing user-value override. A kept value produces an install warning and a
  `custom` doctor state.
- "Enforced" means `commit === ""` and `pr === ""`. A half-set value (`commit` empty,
  `pr` missing) is `custom`, because Claude Code then falls back to its PR footer.
- Unknown sibling fields inside `attribution` are preserved; under `--force` only
  `commit` and `pr` are emptied.
- **Recording**: the ownership ledger (`~/.praxis/owned-permissions.json`, still
  `version: 1`, new optional `attribution: { present, value? }`) stores what the key
  held before praxis wrote it. Only a `written` outcome records; `unchanged` (already
  empty, the user's own) records nothing, and a re-run keeps the first record. A
  `--force` that overwrites a newer custom value replaces the record.
- **Uninstall** restores the recorded value, or deletes the key, only while the setting
  still reads as enforced (a later user edit is never clobbered). No record (pre-ledger
  install, user's own empty value) means nothing is touched.
- **Rollback** needs no code: `settings.json` is already in the install backup.
- **Update**: `praxis update` never touches `settings.json` (its header says so), so it
  does not re-apply the setting; `praxis install` is the way to apply it to an
  existing installation. Documented in README and CHANGELOG.
- **Doctor** prints `attribution: empty | not set | custom | unknown` under Claude Code.
  It is informational and does not change the health verdict, so existing healthy
  installs are not flagged as broken before they re-run `praxis install`.
- The deprecated `includeCoAuthoredBy` is never written (asserted by a test).

## TDD evidence (T1)
- RED (tests written first, `pnpm exec vitest run` on the four touched test files, before
  any source change): `35 failed | 84 passed (119)`: settings-patcher 18 failed
  (`applyEmptyAttribution is not a function` and siblings), install 10, ownership 4,
  cli (doctor states) 3.
- GREEN (after implementation, same four files): `119 passed (119)`; the later
  invalid-JSON doctor test brought `tests/cli.test.ts` to 26 passed.
- Full suite after formatting: `pnpm test` 52 files, 896 tests passed; `pnpm typecheck`
  clean; `pnpm lint` clean; `prettier --check` clean.
- REFACTOR: none needed beyond prettier formatting of three files.
- Tests use temp homes only (`mkdtemp`, `PRAXIS_HOME`); the real `~/.claude` was not
  touched and `praxis install` was never run against it.

## Progress
- 2026-10-03 09:00 — worktree `~/worktrees/praxis-ai/seb-21`, Linear branch, from
  `77acb6a` (PR #27 merged).
- 2026-10-03 — T1 implemented and verified (see TDD evidence). Not pushed.

## Next step
Native review / PR decision by the orchestrator (no push or PR from the writer).
