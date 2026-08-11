# LOGIC branch — Mechanism

A single self-contained HTML file that lets anyone drive a state model by
clicking buttons. Use this branch when the question is about business
logic, state transitions, or data shape — the kind of thing that looks
reasonable on paper but only feels wrong once pushed through real cases.

One file with nothing to install means the demo can be handed to a
non-developer — designer, PM, domain expert — and driven by them. That is
the reason for the shape, and the reason its language is the domain's,
not the code's.

## When this is the right branch

- "I am not sure if this state machine handles the edge case where X
  then Y."
- "Does this data model actually let me represent the case where ...?"
- "I want to feel out what the API should look like before writing it."
- Someone wants to press buttons and watch state change.

If the question is "what should this look like", switch to
[UI.md](UI.md).

## Procedure

### 1. State the question

Before writing code, write the state model and the question being
prototyped. One paragraph, visible in the demo itself — an intro the
reader sees, not a comment only the author reads. A logic prototype that
answers the wrong question is pure waste; the explicit question is the
integrity check.

### 2. Isolate the logic in a portable module

The bit that answers the question lives in one `<script>` block as a
small, pure module that could be lifted into the real codebase later. The
page is throwaway; the module is not.

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
wire to a page. Keep it pure: no DOM, no `document`, no button handlers
reaching inside it. The page calls into the module; nothing flows the
other direction. That purity is what lets the validated reducer, machine,
or function set lift into the real module once the question is answered.

### 3. Build the shareable HTML file

One file, plain HTML/CSS/JS. No framework, no bundler, no server;
everything inline so it opens by double-click and survives being emailed.

Write it for a non-developer: every label in domain language, not code.
Layout, top to bottom:

1. **Title and one-line explanation** of what the demo lets you explore —
   the question from step 1.
2. **Current state**: the full relevant state as a readable panel of
   labelled fields, not a raw JSON dump, re-rendered after every click.
   Call out what just changed where that helps the reader follow.
3. **Free-play buttons**: one per action, always available, so the model
   can be poked in any order. Each click dispatches its action and
   re-renders the state.
4. **Guided walkthroughs**: scenarios, one per tab. Each tab holds a
   short plain-language description — the situation it sets up and what
   to watch for — and under it the ordered buttons for that scenario.
   Each step is a real button: clicking it performs the action and
   advances. Starting a walkthrough resets to a known initial state so
   the scenario runs identically every time.

Choose scenarios that demonstrate the awkward cases: the happy path, a
tricky edge case, an attempt at something that should be illegal.

Keep the styling restrained — clean typography, generous spacing, one
accent colour. Nothing that competes with the state and the buttons.

### 4. Hand over

Send the file or open it. The interesting moments are "wait, that should
not be possible" or "I assumed X would be different" — those are bugs in
the idea, which is the point. If new actions or a new scenario are
needed, add them. Prototypes evolve.

### 5. Capture the answer and the prototype

When the prototype has done its job, capture the answer, then capture the
prototype as [SKILL.md](SKILL.md) describes. The logic-specific mapping:
the validated reducer, machine, or function set is absorbed into the real
module; the HTML shell rides along to the throwaway branch that keeps the
prototype as a primary source, where being one self-contained file keeps
it trivially re-runnable.

## Anti-patterns

- Adding tests. A prototype that needs tests is no longer a prototype.
- Wiring to the real database. Use in-memory state unless the question is
  specifically about persistence.
- Generalising. No "what if we wanted to support X later".
- Blurring logic and page. If the pure module references the DOM,
  `document`, or button handlers, it is no longer liftable.
- Reaching for a framework, bundler, or dev server. One double-clickable
  file; anything else defeats "shareable".
- Shipping the HTML shell to production. The shell is for hand-driven
  inspection; the logic module is the bit worth keeping.
