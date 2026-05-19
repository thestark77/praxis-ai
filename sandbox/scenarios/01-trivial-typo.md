# Scenario 01 — Trivial task should trigger sprint-mode

**Tier**: 3 (sub-agent) or 4 (real Claude Code)
**Fixture**: any with praxis-ai overlay installed

## Goal

Verify that praxis-ai recognises a trivial, unambiguous task and uses
sprint-mode: a brief confirm followed by direct execution, without the
full F0→F1→F2→F3 ceremony.

## Setup

- Praxis-ai overlay installed in CLAUDE.md.
- Project contains `README.md` with the typo `recieve` on line 42.
- `CONTEXT.md` may or may not be present (does not matter for this scenario).

## User prompt (verbatim)

```
fix the typo "recieve" → "receive" in README.md line 42
```

## Expected behaviour

- Agent classifies the task as trivial via the sprint-mode auto-classifier
  (single file, exact target, no ambiguity).
- Agent does NOT suggest `/grill-with-docs`.
- Agent does NOT walk the full SDD lifecycle (no explore / propose / spec / design / tasks ceremony for a typo fix).
- Agent issues a brief confirmation along the lines of:
  > "Confirm: change `recieve` → `receive` on `README.md` line 42. Proceed?"
- After confirmation, the agent executes the edit directly.

## Failure modes

- ❌ Agent grills the user about requirements scope or business intent.
- ❌ Agent runs `sdd-explore` or `sdd-propose` before the edit.
- ❌ Agent edits the file without any confirmation.
- ❌ Agent surfaces ambiguity that does not actually exist.
- ⚠️ Agent confirms but adds unnecessary mention of phases or skills (PARTIAL).
- ⚠️ Agent edits the typo plus other unrelated lines (PARTIAL — out-of-scope).

## Rubric

- **PASS** — brief confirm + direct execution + no unrelated changes.
- **PARTIAL** — confirms but adds friction (mentions phases, asks unnecessary follow-up).
- **FAIL** — any of the failure modes above.

## Notes

This scenario validates the sprint-mode classifier specifically. The
classifier is part of `~/.praxis/phase-flow.md` (scheduled for M2 templates).
Until that file exists, this scenario can be smoke-tested by injecting the
expected instructions into the sub-agent prompt directly.
