# praxis-ai end-to-end test scenarios

Tier 3 testing: sub-agents are spawned in this same Claude Code process,
so they share the parent's `$HOME`, `settings.json`, and the registered
`praxis-ast-hook`. This means their `Bash` tool calls go through the real
firewall, but their context is fresh — useful for behaviour tests.

Each scenario specifies:

- **What it covers** — which praxis virtue / flow / rule.
- **Setup** — preconditions.
- **Action** — what the sub-agent (or human) does.
- **Expected** — pass criterion.
- **Verification** — how to confirm pass/fail.

## Coverage map

praxis-ai virtues (from `docs/philosophy.md`):
- P1 Plan ≠ execution
- P2 Minimal footprint, reversible
- P3 Verification closes the work
- P4 Context is finite
- P5 Tools are first-class
- P6 Irreversibility ⇒ confirm
- P7 Incremental autonomy
- P8 Pre-execution clarification

Phase flow (from `docs/architecture.md` / `~/.praxis/phase-flow.md`):
- F0 Inquiry (TRIVIAL vs NON-TRIVIAL classifier)
- F1 Plan (SDD when gentle-ai present)
- F2 Execute (retry cap, spec-diff critic)
- F3 Review (human gate)

Firewall layers (`docs/firewall.md`):
- L1 — regex deny in `settings.json` `permissions.deny` (~30 patterns)
- L2 — AST PreToolUse hook with 14 rules

Skills lifted from `mattpocock/skills`:
- grill-with-docs, caveman, diagnose, zoom-out, prototype, handoff

## Run protocol

Each `<scenario>.md` is a self-contained spec. The matching
`<scenario>-result.md` records the outcome of an actual run: PASS,
FAIL, SKIPPED, or NEEDS-FOLLOWUP, plus the evidence captured (logs,
transcripts, JSON output).

Results from a given session are aggregated in
`results-<YYYY-MM-DD>.md`.
