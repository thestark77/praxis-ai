---
name: prototype
description: Build a throwaway prototype to flesh out a design before committing to it. Routes between two branches — a single shareable HTML demo for state and business-logic questions, or several radically different UI variations toggleable from one route. Use when the user wants to prototype, sanity-check a data model or state machine, mock up a UI, explore design options, or says "prototype this", "let me play with it", "try a few designs".
invocation: explicit
disable-model-invocation: true
---

# prototype — Mechanism

A prototype is throwaway code that answers a question. The shape of the
question decides the shape of the prototype.

## Routing decision

Identify which question the user is answering, then pick a branch.

- **State, data, or business logic question.** "Does this state machine
  handle edge case X then Y?", "Does this data model represent case Z?",
  "What should the API feel like before I commit to it?". → Read
  [LOGIC.md](LOGIC.md). Build a single self-contained HTML demo — free-play
  buttons plus tabbed guided walkthroughs — over a pure logic module, so a
  non-developer can drive the model too.
- **Visual or layout question.** "What should this page look like?",
  "I want to see options for the dashboard.", "Try a different layout for
  the settings screen." → Read [UI.md](UI.md). Generate several
  radically different UI variations on a single route, switchable from a
  floating bar.

If the question is genuinely ambiguous and the user is not reachable,
default to whichever branch better matches the surrounding code (a
backend module → LOGIC, a page or component → UI). State the assumption
at the top of the prototype.

Getting the routing wrong wastes the entire prototype. If unsure, ask.

## Rules that apply to both branches

1. **Throwaway and marked as such.** Locate the prototype next to the
   module or page it is prototyping for so context is obvious. Name it
   so a casual reader can tell it is not production. For UI routes, obey
   the project's existing routing convention; do not invent a top-level
   structure.
2. **Trivial to run.** A UI prototype starts from one command in the
   project's existing task runner (`package.json`, `Makefile`,
   `justfile`, `pyproject.toml`). A logic demo is a single HTML file the
   user double-clicks. Either way, no thinking required to start it.
3. **No persistence by default.** State lives in memory. Persistence is
   what the prototype is checking, not something it should depend on. If
   the question explicitly involves a database, hit a scratch DB or a
   local file with a "PROTOTYPE — wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the
   prototype runnable, no abstractions. Learn something fast.
5. **Surface the state.** After every action (LOGIC) or on every variant
   switch (UI), print or render the full relevant state so the user can
   see what changed.
6. **Capture it when done.** Fold the validated decision into the real
   code, then keep the prototype itself as a primary source: commit it to
   a throwaway branch, out of the main branch, and leave a pointer to
   that branch on the implementation issue. The main branch keeps only
   the validated decision — no prototype left rotting in it.

## Anti-patterns

- Building a prototype that quietly grows into production code.
- Wiring the prototype to real mutations or the real database.
- Generalising the prototype "in case we need X later".
- Skipping the answer-capture step at the end.

## Capture the answer

The answer — the verdict and the question it settled — is what the
prototype was for. Capture it in the implementation issue, a commit
message, or an ADR, next to the pointer to the throwaway branch that
holds the prototype itself. If the user is around, that capture is a
quick conversation. If not, leave the placeholder so it can be filled in
before the prototype leaves the main branch.
