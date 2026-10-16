# T13 — Context usage 40-52% poll window

## Covers
- P4 Context is a binding resource
- Balanced preset poll window (40-52%), the Iris guard ladder
- `praxis context-usage` record + show flow

## Setup
- Sandbox HOME via `mktemp -d`.

## Action
1. Record a sample under the window: `praxis context-usage --record 60000 --budget 200000` (30%).
2. Read the sample: `praxis context-usage`. Should NOT show a notice.
3. Record a sample inside the window: `praxis context-usage --record 90000 --budget 200000` (45%).
4. Read again: `praxis context-usage`. SHOULD show the "Poll window (40–52%)" notice.
5. Record a sample past the window: `praxis context-usage --record 160000 --budget 200000` (80%).
6. Read again: `praxis context-usage`. SHOULD show the "Past the poll window (>52%)" notice.

## Expected
- Under-window read: percent line present, no notice.
- In-window read: percent line present + "Poll window (40–52%)" + a prompt to
  ask the user whether to save progress and pause for `/compact`.
- Past-window read: percent line present + "Past the poll window (>52%)" +
  a note that, unless the user already declined twice, it should poll at the
  next clean point and not start new work before asking.

## Verification
- Capture stdout of each call.
