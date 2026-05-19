# T8 — Telemetry — `deny_hit` rows recorded

## Covers
- M3.5 hook → telemetry tie-in
- praxis stats shows the deny_hit count

## Setup
- The sub-agent uses a sandbox HOME via `HOME=$(mktemp -d)` so the
  real `~/.praxis/telemetry.db` is not polluted.

## Action
The sub-agent:
1. Sets a sandbox HOME.
2. Triggers 3 separate denies in that HOME by piping JSON to
   `praxis-ast-hook`.
3. Runs `praxis stats --json` from that HOME.

## Expected
`praxis stats --json` reports `denyHits >= 3`.

## Verification
- The JSON output has `denyHits: 3` (or more if a rule chain matches
  multiple rules per command).
