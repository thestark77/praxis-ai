# ODD feature: gentle-ai-strict-tdd-retired (SEB-42)

## Objective
`praxis install` and `praxis update` stop failing against a gentle-ai that retired
`sync --strict-tdd`. The flag is passed only while gentle-ai still accepts it, and the
install/update summary reports the real state instead of a misleading `false`.

## Problem
Observed live 2026-10-03 (`praxis install --force`, praxis 0.1.0-alpha.29):

```
warning: gentle-ai: gentle-ai sync --strict-tdd exited 1. Error: --strict-tdd is retired:
ODD uses applicable test-first development by default; rerun `gentle-ai sync` without
--strict-tdd (retain any other flags)
```

Two call sites hard-code the flag: the bootstrap (`src/lib/gentle-ai-bootstrap.ts`,
`gentle-ai sync --agents <agents> --strict-tdd`) and `praxis update`
(`src/lib/update.ts`, appends `--strict-tdd` when the managed strict-tdd block in
CLAUDE.md reads enabled). That block is still present right after `gentle-ai upgrade`
bumps the binary, so `update` hits the same rejection.

Evidence gathered (read-only):
- gentle-ai v3.7.0 / v3.6.0 `sync --help` (upstream `internal/cli/sync.go`):
  `--strict-tdd   Enable strict TDD mode for SDD agents`.
- gentle-ai 4.0.0 on this host (`gentle-ai sync --help`, exit 0, stdout):
  `--strict-tdd   Retired (rejected); applicable test-first ODD is default`.
  The release that retired the flag is v4.0.0 ("SDD Retires, ODD Leads", 2026-10-01).
- 4.0.0 `gentle-ai sync --strict-tdd --dry-run` exits non-zero at flag parsing with the
  message above, before touching any state.

## Decision
Capability detection, not version pinning. Before passing the flag, probe
`gentle-ai sync --help` and classify the `--strict-tdd` line:
- listed without a retired marker: `supported`, pass the flag;
- listed with `retired` / `rejected` / `deprecated` / `removed`, or absent from a
  recognizable flag listing: `retired`, do not pass it;
- help probe failed or unrecognizable: `unknown`, pass it (old behaviour) with a
  safety net: if that sync fails with gentle-ai's "--strict-tdd is retired" error,
  retry once without the flag. Any other failure surfaces as a warning, unchanged.

The sync keeps every other flag (`--agents`). `--no-strict-tdd` keeps its meaning
(skip the bootstrap's sync step); on a gentle-ai that retired the flag it cannot turn
test-first off, which is documented.

## Scope (authorized)
- `src/lib/gentle-ai-bootstrap.ts`: probe + sync helper, bootstrap uses it, result
  reports `strictTdd` status.
- `src/lib/update.ts` + `src/cli/update.ts`, `src/cli/install.ts`: use the helper and
  report truthfully (`strict-tdd=retired-by-gentle-ai`).
- Tests (fake gentle-ai runner), README, docs, CHANGELOG `[Unreleased]`.

## Constraints
- Strict TDD (source: owner global config "Strict TDD Mode: enabled"); runner
  `pnpm test` (single file `pnpm exec vitest run <path>`).
- Test isolation: never touch the real home or XDG dirs; pin `PRAXIS_HOME`/temp homes.
- No new dependency. Never run `gentle-ai sync` or `praxis install/update` for real.
- Never swallow other sync errors: only the specific retired error triggers the retry.

## Tasks
- [x] T1 - Capability probe + bootstrap + update + CLI summaries + tests + docs. Route:
  direct inline by the single bounded writer (delegated by the orchestrator). Trigger
  evidence: 3 source files, 2 test files, 4 docs; one coherent behavior.
  Commit: `fix(gentle-ai): stop passing the retired --strict-tdd flag to gentle-ai sync`
  (a commit cannot hold its own hash; read it from `git log`).

## Acceptance criteria
- Flag supported: `sync` carries `--strict-tdd`. Flag retired: it does not, and no
  warning is emitted. Other sync failures still surface as warnings.
- Same behavior in `praxis update`.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` green; tests leave XDG dirs untouched.

## Progress
- T1 done. New exports in `src/lib/gentle-ai-bootstrap.ts`: `parseStrictTddSupport`,
  `probeStrictTddSupport`, `isStrictTddRetiredError`, `runGentleAiSync`; the bootstrap
  result gains `strictTdd: enabled | retired-by-gentle-ai | skipped | failed`
  (`ranStrictTddSync` kept); the update result gains `strictTddRetired`.
- Design notes: the sync step stays (plain `gentle-ai sync --agents ...`) so `--force`
  still refreshes managed assets; `--no-strict-tdd` still skips that step. The real 4.0.0
  help line is parsed as `retired` (checked against this host's output).
- Note: the retiring release is gentle-ai v4.0.0 (v3.7.0, the pinned version, still
  accepts the flag); the host runs 4.0.0.

## Verification evidence
- RED (tests first, `pnpm exec vitest run` on the two touched files, before any source
  change): `23 failed | 33 passed (56)` (parseStrictTddSupport missing, no probe, no
  `strictTdd` / `strictTddRetired` fields).
- GREEN (same two files after implementation): `56 passed (56)`.
- `XDG_CONFIG_HOME=<tmp> pnpm test`: 52 files, 918 tests passed; the temp dir was empty
  afterwards. `pnpm typecheck` clean, `pnpm lint` clean, prettier clean on `src`/`tests` TS.
- REFACTOR: none beyond prettier formatting.
