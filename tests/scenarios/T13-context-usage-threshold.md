# T13 — Context usage 50-60% poll window

## Covers
- P4 Context is a binding resource
- Balanced preset poll window (50-60%)
- `praxis context-usage` record + show flow

## Setup
- Sandbox HOME via `mktemp -d`.

## Action
1. Record a sample under the window: `praxis context-usage --record 80000 --budget 200000` (40%).
2. Read the sample: `praxis context-usage`. Should NOT show a notice.
3. Record a sample inside the window: `praxis context-usage --record 110000 --budget 200000` (55%).
4. Read again: `praxis context-usage`. SHOULD show the "Poll window (50–60%)" notice.
5. Record a sample past the window: `praxis context-usage --record 160000 --budget 200000` (80%).
6. Read again: `praxis context-usage`. SHOULD show the "Past the poll window (>60%)" notice.

## Expected
- Under-window read: percent line present, no notice.
- In-window read: percent line present + "Poll window (50–60%)" + a prompt to
  ask the user whether to save progress and pause for `/compact`.
- Past-window read: percent line present + "Past the poll window (>60%)" +
  a note that, unless the user already declined twice, it should poll at the
  next clean point and not start new work before asking.

## Verification
- Capture stdout of each call.
