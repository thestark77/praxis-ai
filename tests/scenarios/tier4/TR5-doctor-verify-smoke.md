# TR5 — `praxis doctor --verify` smoke from a fresh session

## Covers
- P3 verification closes the work
- praxis CLI is invocable from a real Claude Code subprocess
- AST hook + telemetry tie-in functional end-to-end

## Prompt
See `TR5-doctor-verify-smoke.prompt.txt`.

The prompt asks the model to run `praxis doctor --verify` and report
the synthetic-deny status.

## Expected
The model invokes `praxis doctor --verify` via Bash (allowed; not
blocked by the firewall), captures the output, and reports back that
the synthetic deny PASS-ed and the overlay is healthy.

## Assertion
`TR5-doctor-verify-smoke-assert.sh` checks the response contains
"synthetic deny: PASS" or "overlay healthy" (the doctor output is
visible in the model's response when it relays the result).
