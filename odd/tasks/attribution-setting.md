# ODD feature: attribution-setting (SEB-21, slices 1 and 2)

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

### Slice 2 (session link)
Evidence (2026-10-03, Claude Code 2.1.288 settings reference, "Git and attribution"):
`attribution` is an object with `commit` and `pr` strings and a `sessionUrl` Boolean, or
`false` to hide all attribution. `false` needs Claude Code v2.1.281 or later; earlier
versions reject it and skip the whole settings file that holds it, so the docs say to set
`commit` and `pr` to empty strings and `sessionUrl` to `false` instead in a file earlier
versions also read. `sessionUrl: false` omits the claude.ai session link from cloud and
Remote Control commits. With only `{ commit: "", pr: "" }` those sessions were still told
to add a `Claude-Session:` trailer to commits and the session link to PR bodies. Scope:
the enforced value becomes `{ commit: "", pr: "", sessionUrl: false }`; install upgrades
hosts that have slice 1's two-key value; uninstall still restores the pre-praxis value;
doctor flags the missing `sessionUrl`; README and CHANGELOG say so.

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

- [x] T2 — Also hide the session link: enforce `sessionUrl: false`, upgrade the two-key
  value, keep the ledger's pre-praxis record, doctor `not enforced`, docs. Route:
  delegated writer (bounded; slice 1 design already mapped in this document). Trigger
  evidence: 10 files across patcher, installer, CLI, tests and docs. Commit:
  `fix(attribution): also hide the session link trailer`.

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

## Design decisions (T2)
Supersedes the T1 bullets "Enforced means `commit === ""` and `pr === ""`" and "Unknown
sibling fields ... only `commit` and `pr` are emptied"; everything else in T1 holds.
- **Enforced** = `{ commit: "", pr: "", sessionUrl: false }` (extra keys allowed) or the
  boolean `false` (hides everything; counted as enforced, never rewritten, never written
  by praxis because releases before 2.1.281 reject it and skip the whole file). Other
  siblings inside the object are still preserved; install now sets `commit`, `pr` and
  `sessionUrl`.
- **New state `partial`** (`AttributionState` is now `enforced | absent | partial |
  custom`): `commit` and `pr` empty, `sessionUrl` missing or not `false`. It had to be a
  separate state because T1 folded the shape into `enforced` (alpha.29 and alpha.30 wrote
  it) and `custom` means "the user's own text, kept unless `--force`"; the upgrade must
  complete a `partial` value without `--force` or no existing host would ever get
  `sessionUrl: false`. Nothing the user typed except the session-link choice is changed
  by it. An explicit `sessionUrl: true` is overridden too (owner rule: no attribution at
  all); uninstall restores it.
- **Ledger for hosts already on slice 1**: the ledger keeps its `attribution` record
  (`version: 1`, no new field). `applyEmptyAttribution` takes the ledger's existing record
  as `recorded` and returns `previous` as "what uninstall must restore": for a `partial`
  value with no `sessionUrl` key (the exact shape alpha.29/alpha.30 wrote) and a record,
  `previous` is the record (the pre-praxis value, never the intermediate two-key one); a
  `sessionUrl` key present means somebody set it after praxis, so `previous` is that
  newer value and the record is replaced (same rule as a `--force` over a newer custom
  value). A `partial` value with no record is the user's own two-key value: it is
  recorded as `{ present: true, value }` and uninstall gives it back exactly. `enforced`
  values record nothing.
- **Uninstall** reverts only while the attribution still has a shape praxis wrote: empty
  text and `sessionUrl` absent (alpha.29/30 shape, so uninstall works without a
  re-install) or `false`. A later `sessionUrl: true` or boolean `false` edit by the user is
  left alone. Rollback needs no code (settings.json is in the backup).
- **Doctor**: `attribution: not enforced (commit and PR are empty but the claude.ai session
  link is still added). Run `praxis install`.` for `partial`; still informational (does
  not change the health verdict, same as T1). `empty` now reads "no commit, PR or
  session-link attribution".

## TDD evidence (T2)
- RED (tests first, `pnpm exec vitest run` on settings-patcher, ownership, install and
  cli tests, before any source change; `pnpm run build` first because the cli tests run
  the built binary): `24 failed | 122 passed (146)`: settings-patcher 12, install 10,
  cli 2 (boolean `false` and two-key doctor states). ownership.test.ts needed no change
  (the ledger shape is unchanged) and passed throughout.
- GREEN (same four files after implementation): `146 passed (146)`.
- Full suite: `XDG_CONFIG_HOME=$(mktemp -d) pnpm test` 52 files, 944 tests passed
  (alpha.30 baseline 918); `pnpm typecheck` and `pnpm lint` clean;
  `prettier --check "src/**/*.ts" "tests/**/*.ts"` clean (`prettier --check src tests`
  still reports 24 `tests/scenarios/*.md` files that were unformatted before this change).
- REFACTOR: none beyond prettier formatting.
- Tests use temp homes only (`mkdtemp`, `PRAXIS_HOME`); the real `~/.claude`, `~/.praxis`
  and `~/.config` were not touched and `praxis install` was never run against them.

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

- 2026-10-03 09:20 — Native review of `77acb6a..02b5a35` (assessed `high`): four lenses,
  approved, acknowledged, authority burned (lineage `review-3e5b2f57bd2ddb38`). Parent
  spot check: `pnpm exec vitest run tests/lib/settings-patcher.test.ts` -> 36 passed.
  Advisory (not fixed): the ledger records the previous value after the settings write,
  so a crash between both leaves no record and `uninstall` would not restore it; two
  readability/reliability suggestions.

- 2026-10-03 — T2 implemented and verified (see TDD evidence (T2)). Not pushed.

## Next step
Merge T2, release it, then run `praxis install` (no `--force` needed for a host on the
two-key value) on the VPS and confirm `praxis doctor` shows `attribution: empty`.
