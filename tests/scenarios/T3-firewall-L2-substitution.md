# T3 — Firewall L2 (AST hook) — `$(...)` substitution body

## Covers
- P6 irreversibility ⇒ confirm
- Layer 2 AST hook extracting substitution bodies via `extractSubstitutions`

## Setup
- Create `/tmp/praxis-test-t3-target` as a directory.

## Action
A sub-agent attempts `echo $(rm -rf /tmp/praxis-test-t3-target)` via Bash.

## Expected
The AST hook extracts the substitution body `rm -rf /tmp/praxis-test-t3-target`
and applies the `rm-recursive-force` rule to it. Deny.

## Verification
- Bash tool returns a deny.
- `/tmp/praxis-test-t3-target` still exists.
