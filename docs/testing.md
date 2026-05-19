# Testing strategy

praxis-ai's tests are organised as a four-tier pyramid. Each tier covers a
different class of risk and runs at a different speed and cost.

## Tier overview

| Tier | What it tests | Where | Cost | Speed | Runs on |
|------|---------------|-------|------|-------|---------|
| 1 — Vitest unit | Pure logic: tokeniser, rules, telemetry queries, settings patcher, install lib | `tests/lib/`, `tests/cli/` | Free | <2 s | Every push, every PR (CI matrix). `npm test` locally. |
| 2 — Vitest integration | Cross-module flow: full install → uninstall → rollback round-trip, end-to-end CLI smoke via spawned `praxis` bin in sandbox HOME | `tests/integration/`, `tests/cli.test.ts` | Free | <2 s | Same as Tier 1. |
| 3 — Tier 3 sub-agents | praxis behaviour with a real (parent-shared) Claude Code context: firewall enforcement on live `Bash` tool calls, telemetry recording, skill discovery, doctor verify, classifier reasoning | `tests/scenarios/T1–T14` | Free (uses session context) | ~60 s for 14 | Manually triggered by running `Agent({ subagent_type: "general-purpose", ... })` against scenario specs. |
| 4 — Tier 4 real `claude --print` | praxis behaviour in cold sessions with sandbox HOME: F0 classifier on a fresh process, firewall against a real LLM-driven Bash call, skill auto-discovery from clean install | `tests/scenarios/tier4/` | ~$0.05–0.10 / full run (Haiku 4.5) | ~3 min for 5 | Opt-in via `npm run test:tier4`. Never in CI. |

The tiers are complementary, not redundant. Tier 1 + 2 prove the building
blocks. Tier 3 proves they compose under the real firewall. Tier 4 proves
the model honours the praxis instructions from a cold start.

## Tier 1 — Vitest unit

223 tests across 21 files. Coverage:

- `src/lib/ast/` — tokeniser, rules, inspect (66 tests)
- `src/lib/telemetry/` — db, events, queries (17)
- `src/lib/install.ts`, `src/lib/skeleton-installer.ts`, `src/lib/settings-patcher.ts`, `src/lib/backup.ts`, `src/lib/claudemd-patcher.ts`, `src/lib/detector.ts`, `src/lib/paths.ts`, `src/lib/pocock-sync.ts` (90)
- `src/cli/` — telemetry hook integration, ast-hook binary (10)
- `tests/cli.test.ts` — CLI surface, version, sandboxed HOME smoke (14)
- `tests/lib/lifted-skills.test.ts` — manifest + per-skill NOTICE.md SHAs (8)
- Integration: `tests/integration/install-flow.test.ts` (3)
- `tests/lib/ast/settings-patcher-hook.test.ts` — hook entry add/remove (7)
- Bench script smoke (covered indirectly)

Every test sandboxes via `mkdtemp` and `HOME` override; nothing touches the
real `~/.claude`.

## Tier 2 — Vitest integration

Same `npm test` invocation; tests under `tests/integration/` exercise the
install → uninstall → rollback lifecycle against fixture HOMEs. Confirms
the marker-bounded `CLAUDE.md` block survives round-trips, settings.json
deny entries merge with user entries cleanly, and backups are restored
byte-identical.

## Tier 3 — Sub-agent scenarios

`tests/scenarios/T1–T14.md` plus
`tests/scenarios/results-<date>.md` aggregates. Each scenario spec
documents what it covers, the action, the expected behaviour, and the
verification recipe.

Tier 3 sub-agents run in the current Claude Code session (they inherit
the parent's `$HOME` and `settings.json`), so their `Bash` tool calls go
through the real praxis firewall but their context is fresh. This catches
firewall regressions and telemetry-recording bugs end-to-end at zero cost.

Latest run (alpha.3, the post-fix re-run): **13 / 14 PASS, 1 ANOMALY**
(T1: spec-order correction — the AST hook fires before the regex deny
list, not after). See `tests/scenarios/results-2026-05-19.md`.

## Tier 4 — Real `claude --print` subprocess

`tests/scenarios/tier4/` is the only tier that exercises praxis-ai
against a brand-new Claude Code session in an isolated HOME. The runner:

1. `mktemp -d` for the sandbox HOME.
2. Seeds auth from the real HOME (`~/.claude/.credentials.json`,
   `~/.claude.json` — nothing else copied).
3. Runs `praxis install` in the sandbox so the `@-import` block,
   firewall, and AST hook are all live.
4. Spawns `claude --print --model <model> -p "<prompt>"` with
   `HOME=$sandbox`, captures stdout + exit code.
5. Runs the scenario's `<id>-assert.sh` against the captured output and
   emits PASS / FAIL.

Five scenarios cover the praxis virtues that need a cold-start session:

| ID | Covers |
|----|--------|
| TR1 | F0 TRIVIAL classifier (terse confirmation, no grilling) |
| TR2 | F0 NON-TRIVIAL classifier (proposes `/grill-with-docs` or surfaces concrete ambiguities) |
| TR3 | AST hook intercepts a real LLM-driven `rm -rf` |
| TR4 | Skill auto-discovery — all six lifted skills visible from a clean install |
| TR5 | `praxis doctor --verify` end-to-end through an LLM-driven Bash call |

Latest run (alpha.5): **5 / 5 PASS**. See
`tests/scenarios/tier4/results-2026-05-19.md`.

### Tier 4 cost

The runner defaults to Haiku 4.5 — each scenario is one `claude --print`
invocation against a small system prompt (~15–20 K tokens including the
praxis overlay) and a short user prompt. Cost is roughly $0.01–0.02 per
scenario; a full five-scenario run lands at $0.05–0.10. Override with
`PRAXIS_TIER4_MODEL=claude-sonnet-4-6` for higher classifier fidelity at
~10× cost.

### Tier 4 limitations

- **Non-determinism**: LLM output varies between runs. Assertions are
  substring-based and accept multiple valid forms of the praxis
  behaviour (TR1 accepts y/n OR "Confirm?" OR "I need permission";
  TR2 accepts `/grill-with-docs` proposal OR direct concrete-ambiguity
  questioning). Tighten when needed.
- **Cost gating**: never run in CI or as part of `npm test`. Always
  opt-in.
- **Auth-bound**: the sandbox HOME borrows the real user's Claude Code
  credentials. The sandbox does NOT touch `~/.claude/` outside copying
  those auth files.

## Hook latency benchmark

`scripts/bench-hook.sh` (also `npm run bench:hook`) times
`praxis-ast-hook` over N invocations across four paths. CI runs the
benchmark on every matrix cell (ubuntu-latest + macos-latest × Node 18 /
20 / 22) so cross-platform numbers ship on every push.

### Latest CI numbers (per-invocation ms)

| Path | ubuntu-18 | ubuntu-20 | ubuntu-22 | macos-18 | macos-20 | macos-22 |
|------|-----------|-----------|-----------|----------|----------|----------|
| cold-allow | 55.6 | 49.6 | **42.3** | 58.6 | 45.3 | **44.1** |
| warm-allow | 55.1 | 49.6 | **41.6** | 57.5 | 60.2 | **46.5** |
| warm-deny | 60.3 | 54.9 | **45.8** | 66.2 | 62.6 | **47.8** |
| no-telemetry-deny | 54.2 | 49.9 | **40.5** | 56.2 | 51.8 | **49.7** |

Bold = current minimum on that platform. Highlights:

- Newer Node is faster across the board. Node 22 is ~25 % faster than
  Node 18.
- macOS is comparable to ubuntu on Node 22 but slower on older Node.
- The deny path costs an extra 5–10 ms over allow on most platforms.
  Disabling telemetry (`PRAXIS_TELEMETRY_DISABLED=1`) saves that cost.
- Dominant cost is Node startup; rule evaluation is sub-ms.

## Coverage scorecard

| Praxis virtue / flow | Covered by |
|----------------------|------------|
| P1 Plan ≠ execution | TR1, TR2 |
| P2 Reversibility | T14 (round-trip), Tier 1 install-tests |
| P3 Verification closes the work | T10, TR5 |
| P4 Context is binding | T13 (75 % threshold warning) |
| P5 Tools are first-class | Implicit across all tiers |
| P6 Irreversibility ⇒ confirm | T1–T6, TR3, Tier 1 rule tests |
| P7 Incremental autonomy | Partial — TR1/TR2 cover F0 but not F2 retry-cap |
| P8 Pre-execution clarification | T11, T12, TR1, TR2 |
| F0 TRIVIAL | T11, TR1 |
| F0 NON-TRIVIAL | T12, TR2 |
| F1 / F2 / F3 | NOT covered — would need a multi-turn Tier 4 |
| Firewall L1 regex | T1, Tier 1 settings-patcher tests |
| Firewall L2 AST | T2–T6, TR3, Tier 1 rules tests |
| Telemetry deny_hit | T8, Tier 1 telemetry tests |
| Skill lifts | T9, TR4 |
| Doctor verify | T10, TR5 |

## Adding a scenario

1. Decide which tier. Pure logic → Tier 1. Cross-module flow → Tier 2.
   Live firewall behaviour with shared context → Tier 3 sub-agent.
   Cold-session behaviour → Tier 4.
2. For Tier 3 / 4: write a `<id>-name.md` spec under
   `tests/scenarios/` (Tier 3) or `tests/scenarios/tier4/` (Tier 4).
3. For Tier 4: also write `<id>-name.prompt.txt` (the user prompt the
   subprocess receives) and `<id>-name-assert.sh` (the assertion that
   parses captured stdout and emits `PASS: <evidence>` or
   `FAIL: <reason>`).
4. Run locally: `npm run test:tier4 <id>`.
5. Update the results doc when a behaviour changes.
