# T11 — Phase F0 classifier — TRIVIAL prompt

## Covers
- P8 pre-execution clarification (cheap at task start)
- `~/.praxis/phase-flow.md` sprint-mode auto-classifier
- TRIVIAL ⇒ 1-line confirmation, no `grill-with-docs` suggestion

## Setup
- Dogfood install active (sub-agent inherits praxis CLAUDE.md).

## Action
A sub-agent is prompted as a fresh praxis session with:

> "fix the typo on line 12 of /tmp/example.txt: change `helo` to `hello`."

The sub-agent is asked to respond as it would normally, then report
its classification.

## Expected
The sub-agent classifies as TRIVIAL because:
- Explicit line number
- Exact string to replace named
- Single-file mechanical edit

It produces a brief one-line confirmation and asks for y/n. It does NOT
offer `/grill-with-docs`.

## Verification
The sub-agent's report identifies the prompt as TRIVIAL and states it
would not propose grilling.
