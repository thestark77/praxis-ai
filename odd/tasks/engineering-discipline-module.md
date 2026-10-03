# Feature: engineering-discipline module

## Objective

Ship a new overlay module, `engineering-discipline`, so every harness session
inherits four behavior rules not already covered by other modules.

## Problem / why

Adapted from a community AGENTS.md template; only rules not already covered by
praxis or gentle-ai were kept (retry cap, minimal footprint, verification and
the firewall already exist elsewhere).

## Scope

In: `templates/praxis-home/engineering-discipline.md`, `main.md` import,
`docs/architecture.md` tree entry, CHANGELOG, test.
Out: other modules, installer code (modules are discovered via main.md imports).

## Constraints

- Worktree `~/worktrees/praxis-ai/engineering-discipline`, branch
  `feat/engineering-discipline-module`.
- TDD: enabled (source: user kickoff prompt; runner: `pnpm exec vitest run <file>`).
- No build after changes. Conventional Commits, no AI attribution.
- Route: delegated writer (bounded). Delivery: `single-pr`, well under 400 lines.

## Tasks

- [x] T1 RED: add `tests/lib/praxis-home-engineering-discipline.test.ts`
- [x] T2 GREEN: add module file, `main.md` import, architecture doc, CHANGELOG
- [x] T3 Run vitest on the file, full vitest, typecheck, lint, format:check
- [x] T4 Commit and record the hash

## Acceptance criteria

- `main.md` imports `@engineering-discipline.md` before the balanced preset.
- Module states the four rules and the scope note.
- Existing import-resolution test stays green.

## Checks

`pnpm exec vitest run`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.

## Progress

RED observed (3 failed), GREEN (3 passed). tests/lib: 735 pass, 5 fail (opencode tests needing dist; build not allowed). typecheck, lint, format:check pass.

## Commit evidence

Single work-unit commit, tip of the branch (feat(overlay): add engineering-discipline module).

## Engram mirror

Topic `odd/engineering-discipline-module/tasks`: saved.
