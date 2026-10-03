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
commit (7c630f0 here) so the module survives; a later PR of the old branch would conflict and
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
- [x] T2 RED then GREEN: ship the on-demand skills
  (manifest, SKILL.md files, tests carrying every clause assertion)
- [x] T3 RED then GREEN: slim the always-loaded layer
  (byte-budget test, main.md index, trimmed firewall/precedence/preset, remove moved modules)
- [x] T4 Docs: architecture, README, CHANGELOG, measurements in this document
- [x] T5 Verification and Engram mirror

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

Bytes are UTF-8 file sizes; tokens are bytes / 4 (the same approximation the
parent used). "Listing" is the `- name: description` line each auto-loadable
skill adds to the always-visible skill list (approximation of the listing
format; `away-mode` is `disable-model-invocation`, so it adds none).

| | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Files imported by `main.md` | 17 | 9 | -8 |
| Lines in those files | 897 | 410 | -487 |
| `@`-import bytes | 36,341 | 16,881 | -19,460 (-53.5%) |
| `@`-import tokens (bytes/4) | 9,085 | 4,220 | -4,865 |
| New skill-listing bytes | 0 | 1,471 | +1,471 |
| Always-loaded bytes (imports + listing) | 36,341 | 18,352 | -17,989 (-49.5%) |
| Always-loaded tokens (bytes/4) | 9,085 | 4,588 | -4,497 |
| Largest single always-loaded file | 6,026 (`context-budget.md`) | 3,404 (`phase-flow.md`) | |

Per file (always-loaded, bytes before to after): `main.md` 731 to 2,582 (now
carries the index), `philosophy.md` 1,895 (same), `phase-flow.md` 3,404
(same), `queue-rule.md` 1,061 (same), `skill-invocation-policy.md` 1,674
(same), `precedence-rules.md` 2,168 to 1,196, `irreversibility-firewall.md`
3,533 to 2,696, `engineering-discipline.md` 1,359 to 1,366 (skill name),
`presets/balanced.md` 1,795 to 1,007. Removed from the always-loaded layer:
`grilling.md` 2,196, `context-conventions.md` 1,533, `command-handoff.md`
2,154, `workflow-policy.md` 1,618, `effort-policy.md` 1,364,
`context-budget.md` 6,026, `upstream-first-debugging.md` 2,399,
`browser-testing-policy.md` 1,431.

Skill bodies (loaded only when the situation matches): `praxis-context-guard`
6,300, `praxis-grilling` 4,133, `praxis-overlay-reference` 3,565,
`praxis-delegation-policy` 3,417, `praxis-upstream-debugging` 2,698,
`praxis-command-handoff` 2,428, `praxis-firewall-protocol` 1,739,
`praxis-browser-testing` 1,641 (25,921 bytes in total, 0 paid per turn).

Budgets asserted by tests: imports <= 17,500 bytes, imports + listing <=
19,000 bytes, each always-loaded file <= 200 lines, listing <= 2,000 bytes.

Out of scope here and still large: gentle-ai about 16.6k tokens (third
party) and the iris blocks about 0.9k tokens (SEB-17). Remaining praxis
candidates if the owner wants to go further: `phase-flow.md` (3.4 KB, the
classifier plus rails, kept whole because it runs before every prompt) and
`philosophy.md` (1.9 KB of values, kept whole).

## Progress

- T0 done: cherry-picked as 7c630f0.
- T1 done: inventory above; baseline `pnpm exec vitest run` = 42 failed
  (6 files, all `dist/` dependent) / 770 passed (812).
- T2 done: RED observed (57 failed of 57 in `tests/lib/praxis-overlay-skills.test.ts`),
  GREEN after the skills and manifest (57 passed). Commit b241193.
  Route: direct inline by the single writer (a one-shot script relocated the text verbatim).
- T3 done: RED observed (11 failed of 12 in `tests/lib/always-loaded-budget.test.ts`),
  GREEN after trimming and removing the moved modules. An end-to-end install
  test (`tests/integration/slim-context-install.test.ts`) was added as a
  characterisation test (it passed on first run because the behavior is the
  existing installer plus the new templates). Commit 3920b74.
- Losslessness check (manual, one-shot, against `8873d37`): all 649 non-empty
  lines of the 16 original modules still exist in the new always-loaded files
  or the `praxis-*` skills (headings compared without their `#` level). The
  only 9 absent are the 8 removed `@`-import lines in `main.md` and one
  deliberate rewrite (`See context-budget.md` became `See the praxis-context-guard skill`).
- T4 done: `docs/architecture.md` (layout, new "Always-loaded budget"
  section), README, CHANGELOG (with upgrade notes), this document.
- T5 done: full suite 42 failed (same 6 files, same dist-dependent set) /
  812 passed (854); `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean.

Route per task: all delegated-writer work done by a single writer; no SDD
artifacts. Review tier: not assessed here (the parent owns review and the
PR; no native review was started).

Known risks (rules that could be missed when their skill is not loaded):
the model must recognise the trigger from a one-line description. The rules
whose miss would hurt are therefore duplicated as one-line invariants in the
index: secret handling, the `[IRIS CONTEXT GUARD]` trust boundary, delegation
limits, upstream-debugging OK, browser-use first. The detailed formats (exact
`COMPACT-READY` replies, handoff path rules, grilling stop conditions, block
report layout) rely on the skill loading. Existing installs need
`praxis install --force` to apply the new `main.md`.

## Engram mirror

Topic `odd/slim-always-loaded-context/tasks`, project `praxis`.
