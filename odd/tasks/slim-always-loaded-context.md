# Feature: slim the always-loaded praxis context

Linear: SEB-16 "Adelgazar el contexto base: bloque de praxis-ai en CLAUDE.md".

## Objective

Cut the context every Claude Code turn pays for the praxis overlay by keeping
only invariants always-loaded and relocating procedures to on-demand skills.
Nothing is deleted: every rule keeps its semantics and gains a pointer.

## Problem / why

`@~/.praxis/main.md` pulls 17 files (36,341 bytes, 897 lines, about 9.1k
tokens) into every turn. Claude Code expands `@` imports at launch, so an
import saves nothing ("imports help you organize a long file but don't reduce
its context cost"). Anthropic guidance: keep the always-loaded layer under
about 200 lines, put procedures in skills (description always loaded, body on
demand) and anything that must hold deterministically in hooks.
Sources: code.claude.com/docs/en/memory, /docs/en/skills, /docs/en/best-practices,
anthropic.com/engineering/effective-context-engineering-for-ai-agents.

## Scope

In: `templates/praxis-home/*`, new native skills under
`templates/claude-skills/`, `src/data/praxis-native-skills.ts`, tests, docs
(`docs/architecture.md`, README, CHANGELOG).
Out: gentle-ai blocks (third party), iris blocks (SEB-17), the live
`~/.praxis` and `~/.claude` (never touched), installer prune/migration logic,
pushing or opening the PR (the parent does that; the owner reviews it).

## Constraints

- Worktree `~/worktrees/praxis-ai/slim-context`, branch
  `feat/slim-always-loaded-context`, from `origin/main` 8873d37.
- TDD: enabled (source: Claude Code overlay "Strict TDD Mode: enabled" plus the
  kickoff prompt). Runner: `pnpm exec vitest run <file>`. The repo `pnpm test`
  runs `pnpm run build` first and the owner forbids building after changes, so
  the full-suite proof is `pnpm exec vitest run`; 42 tests in 6 files need
  `dist/` and already fail on the base commit (baseline, not caused here).
- Conventional Commits, no AI attribution lines. No build, no push, no merge.
- Route: delegated writer (single writer). Trigger evidence: writer trigger,
  2+ non-trivial files; preparation trigger, reading that prepares the write.
- Delivery: `single-pr`. The diff is mostly relocated text (about 15 KB moved),
  so the 400-line figure is only a planning heuristic and is exceeded by pure
  moves; work-unit commits keep each step reviewable.
- Effective always-loaded cost = expanded `main.md` imports + the skill-listing
  line (`name` + `description`) of every skill that can auto-load. Both are
  measured. `disable-model-invocation` skills do not add a listing line.

## Engineering-discipline finding (not on origin/main)

The live `~/.praxis/engineering-discipline.md` and the live `main.md` import
come from the unmerged local branch `feat/engineering-discipline-module`
(commit dcea724, 2026-10-02 13:53:29 -0500; worktree
`~/worktrees/praxis-ai/engineering-discipline`). The live files are
byte-identical to that commit and their mtime (13:53) matches the commit time,
so it was deployed by running the installer from that worktree (with
overwrite, since `main.md` changed). The branch was never pushed (`git ls-remote`
shows only `main`), there is no PR for it, and `origin/main` does not contain it.
Risk: any install from `main` rewrites `main.md` without the import and the
module silently drops out. This branch cherry-picks dcea724 as its first
commit so the module survives; a later PR of the old branch would conflict and
should be closed in favour of this one.

## Inventory and classification

Classes: A = must stay always-loaded, B = move to an on-demand skill,
C = already enforced by a hook (keep a pointer). Bytes are the file on
`origin/main` plus engineering-discipline (the live set).

| Module | Bytes | Class | Decision |
| --- | ---: | :-: | --- |
| main.md | 731 | A | Rewritten: imports plus the on-demand skills index |
| philosophy.md | 1895 | A | Stays verbatim (values behind every decision) |
| phase-flow.md | 3404 | A | Stays verbatim (classifier runs before every prompt; F2 rails) |
| queue-rule.md | 1061 | A | Stays verbatim |
| skill-invocation-policy.md | 1674 | A | Stays verbatim (meta-rule for every skill decision) |
| precedence-rules.md | 2168 | A+B | Keep domain ownership and conflict rule; rationale, "does not touch", standalone mode move to `praxis-overlay-reference` |
| irreversibility-firewall.md | 3533 | A+B+C | Keep guard-evasion bans, anticipatory pauses, principle and a short block summary (deny list and AST hook enforce the patterns, not the intent); the block report protocol and framing move to `praxis-firewall-protocol` |
| grilling.md | 2196 | B | `praxis-grilling` |
| context-conventions.md | 1533 | B | `praxis-grilling` (CONTEXT.md, ADR, RTK.md formats) |
| command-handoff.md | 2154 | A+B | One-line invariant in the index; body to `praxis-command-handoff` |
| workflow-policy.md | 1618 | B | `praxis-delegation-policy` |
| effort-policy.md | 1364 | B | `praxis-delegation-policy` |
| context-budget.md | 6026 | A+B | Trust boundary and poll rule as index lines; protocol to `praxis-context-guard` |
| upstream-first-debugging.md | 2399 | B | `praxis-upstream-debugging` |
| browser-testing-policy.md | 1431 | B | `praxis-browser-testing` |
| engineering-discipline.md | 1359 | A | Stays (reference renamed to the skill) |
| presets/balanced.md | 1795 | A+B | Condensed; full text to `praxis-overlay-reference` |

No module is purely class C: the hook blocks literal patterns, but the
guard-evasion rules exist precisely for spellings a pattern cannot catch.

## Tasks

- [x] T0 Cherry-pick engineering-discipline (dcea724) so the live module is not lost
- [x] T1 Inventory, classification and baseline measurement (this document)
- [ ] T2 RED then GREEN: ship the on-demand skills
  (manifest, SKILL.md files, tests carrying every clause assertion)
- [ ] T3 RED then GREEN: slim the always-loaded layer
  (byte-budget test, main.md index, trimmed firewall/precedence/preset, remove moved modules)
- [ ] T4 Docs: architecture, README, CHANGELOG, measurements in this document
- [ ] T5 Verification and Engram mirror

## Acceptance criteria

- Always-loaded praxis imports at or under the byte budget asserted by a test.
- Every moved module has a native skill with `invocation: contextual`,
  `praxis-native: true`, a trigger-first description, and listed in the manifest.
- `main.md` names every skill and keeps the one-line invariant for each.
- Every clause the old module tests asserted is still asserted against its new
  home; no module file that moved is still imported.

## Checks

`pnpm exec vitest run` (baseline: 42 dist-dependent failures), `pnpm typecheck`,
`pnpm lint`, `pnpm format:check`. No build, no live install.

## Measurements

(filled in at T4)

## Progress

(filled in as tasks close)

## Engram mirror

Topic `odd/slim-always-loaded-context/tasks`, project `praxis`.
