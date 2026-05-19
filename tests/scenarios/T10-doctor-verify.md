# T10 — `praxis doctor --verify` healthy end-to-end

## Covers
- P3 verification closes the work
- End-to-end firewall validation via synthetic payload

## Setup
- Dogfood install active.

## Action
A sub-agent runs `praxis doctor --verify` via Bash.

## Expected
Output ends with `status: ✓ overlay healthy` and contains:
- `AST hook verify` section
- `synthetic deny: PASS`
- The registered hook command line

## Verification
- Exit code 0.
- stdout contains the strings above.
