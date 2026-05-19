# T7 — Allow path — safe Bash command

## Covers
- The firewall is not over-eager — legitimate Bash work passes through.
- AST hook allow path (~41 ms cold per docs/firewall.md).

## Setup
- None.

## Action
A sub-agent runs `echo "praxis allow test"` via Bash.

## Expected
The command executes successfully and emits `praxis allow test`.

## Verification
- Bash tool result shows stdout `praxis allow test`.
- No deny reason is surfaced.
