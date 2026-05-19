# TR1 — TRIVIAL classifier behaviour

## Covers
- P8 pre-execution clarification
- `~/.praxis/phase-flow.md` sprint-mode auto-classifier (TRIVIAL path)
- Real Claude Code session (not a sub-agent that inherits this session's context)

## Prompt
See `TR1-trivial-classifier.prompt.txt`.

## Expected
The model identifies the request as TRIVIAL and produces a terse
confirmation asking y/n. The response does NOT mention
`/grill-with-docs`, `/sdd-*`, or phase machinery. No tool is invoked
(it's just a confirmation).

## Assertion
`TR1-trivial-classifier-assert.sh` checks that the captured stdout:

- Contains "y/n" or "y / n" or "(y/n)" pattern
- Does NOT contain "grill-with-docs" (case-insensitive)
- Does NOT contain "/sdd-" (case-insensitive)
- Exit code is 0
