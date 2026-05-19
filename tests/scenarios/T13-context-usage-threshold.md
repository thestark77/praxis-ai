# T13 — Context usage 75% threshold warning

## Covers
- P4 Context is a binding resource
- Balanced preset threshold (75%)
- `praxis context-usage` record + show flow

## Setup
- Sandbox HOME via `mktemp -d`.

## Action
1. Record a sample under threshold: `praxis context-usage --record 5000 --budget 200000`.
2. Read the sample: `praxis context-usage`. Should NOT show the warning.
3. Record a sample over threshold: `praxis context-usage --record 160000 --budget 200000` (80%).
4. Read again: `praxis context-usage`. SHOULD show the "Above 75% threshold" warning.

## Expected
- Under-threshold read: percent line present, no warning.
- Over-threshold read: percent line present + "Above 75% threshold" + suggestion to `/clear`.

## Verification
- Capture stdout of each call.
