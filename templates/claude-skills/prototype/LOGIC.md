# LOGIC branch — Mechanism

A small interactive terminal app that lets the user drive a state model
by hand. Use this branch when the question is about business logic,
state transitions, or data shape — the kind of thing that looks
reasonable on paper but only feels wrong once pushed through real cases.

## When this is the right branch

- "I am not sure if this state machine handles the edge case where X
  then Y."
- "Does this data model actually let me represent the case where ...?"
- "I want to feel out what the API should look like before writing it."
- The user wants to press buttons and watch state change.

If the question is "what should this look like", switch to
[UI.md](UI.md).

## Procedure

### 1. State the question

Before writing code, write the state model and the question being
prototyped. One paragraph, in the prototype's README or a top-of-file
comment. A logic prototype that answers the wrong question is pure
waste; the explicit question is the integrity check.

### 2. Pick the language

Use the host project's runtime. If the project has no obvious runtime,
ask. Match the project's existing conventions for tooling; do not add a
new package manager or runtime for the prototype.

### 3. Isolate the logic in a portable module

The bit that answers the question lives behind a small, pure interface
that could be lifted into the real codebase later. The TUI is throwaway;
the logic module is not.

Shape depends on the question:

- **Pure reducer**: `(state, action) => state`. Good when actions are
  discrete events and state is a single value.
- **State machine**: explicit states and transitions. Good when "which
  actions are even legal right now" is part of the question.
- **Pure functions over a plain data type**. Good when there is no
  implicit current state, just transformations.
- **Class or module with a clear method surface**. Good when the logic
  genuinely owns ongoing internal state.

Pick the shape that fits the question, not the shape that is easiest to
wire to a TUI. Keep it pure: no I/O, no terminal code, no `console.log`
for control flow. The TUI imports the module and calls into it; nothing
flows the other direction.

### 4. Build the smallest TUI that exposes the state

Lightweight TUI. On every tick, clear the screen (`console.clear()`,
`print("\033[2J\033[H")`, or equivalent) and re-render the whole frame.
One stable view, not scrollback.

Each frame has two parts, in this order:

1. **Current state**, pretty-printed and diff-friendly (one field per
   line or formatted JSON). Bold for field names or section headers; dim
   for less important context (timestamps, IDs, derived values). Native
   ANSI escape codes are sufficient (`\x1b[1m` bold, `\x1b[2m` dim,
   `\x1b[0m` reset).
2. **Keyboard shortcuts**, listed at the bottom:
   `[a] add user  [d] delete user  [t] tick clock  [q] quit`. Bold the
   key, dim the description, or vice versa.

Behaviour:

1. Initialise state as a single in-memory object. Render the first frame
   on start.
2. Read one keystroke (or one line) at a time. Dispatch to a handler
   that mutates state.
3. Re-render the full frame after every action. Replace, do not append.
4. Loop until quit.

The whole frame should fit on one screen.

### 5. One-command run

Add the script to the project's existing task runner. The user must
invoke it with `pnpm run <name>` or the project's equivalent. Never
require remembering a path.

### 6. Hand over

Give the user the run command. The interesting moments are "wait, that
should not be possible" or "I assumed X would be different" — those are
bugs in the idea, which is the point. If new actions are needed, add
them. Prototypes evolve.

### 7. Capture the answer

When the prototype has done its job, the answer is the only thing worth
keeping. Capture it in commit, ADR, issue, or `NOTES.md` next to the
prototype before deleting the shell.

## Anti-patterns

- Adding tests. A prototype that needs tests is no longer a prototype.
- Wiring to the real database. Use an in-memory store unless the
  question is specifically about persistence.
- Generalising. No "what if we wanted to support X later".
- Blurring logic and TUI. If the reducer references `console.log`,
  prompts, or terminal escape codes, it is no longer portable.
- Shipping the TUI shell to production. The shell is for hand-driven
  inspection; the logic module is the bit worth keeping.
