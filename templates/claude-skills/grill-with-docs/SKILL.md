---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
invocation: explicit
---

# grill-with-docs — Mechanism

A structured interview that resolves ambiguity before code is written, and
captures resolved vocabulary into `CONTEXT.md` and decisions into ADRs.

## Inputs the agent must read first

1. `CONTEXT.md` at the project root (or per-context, if `CONTEXT-MAP.md`
   exists). The agent must use existing terms verbatim; never redefine.
2. `docs/adr/*.md` in the area being touched. Past decisions constrain
   current ones.
3. The user's request, parsed for the top three ambiguities.

## Procedure

1. **Surface the top three ambiguities.** Concrete, not generic. Name the
   specific dimension (e.g. "session storage layer", "redirect URI
   handling"), not "the scope" or "the requirements".
2. **Ask one question at a time.** After each answer, decide whether to ask
   another or move on. Never batch questions.
3. **Provide a recommended answer with each question.** State the
   recommendation, the trade-off, and what would flip the call.
4. **Prefer code reading to asking** when the question is answerable by
   reading the codebase. Read, then confirm with the user.
5. **Update `CONTEXT.md` inline.** When a term is resolved, write the H2
   section immediately. Do not batch updates. Format per
   `~/.praxis/context-conventions.md`.
6. **Cross-reference code.** When the user states how something works,
   check the code. If you find a contradiction, surface it as a question.
7. **Challenge glossary conflicts.** If the user uses a term that conflicts
   with the existing `CONTEXT.md`, call it out and force resolution.
8. **Sharpen fuzzy language.** When a term is vague or overloaded, propose
   a precise canonical term and ask which the user means.
9. **Stress-test relationships with concrete scenarios.** Invent edge-case
   scenarios that force precision about boundaries between concepts.

## When to write an ADR

Offer an ADR only when **all three** conditions are true:

1. **Hard to reverse** — changing the decision later has a meaningful cost.
2. **Surprising without context** — a future reader will ask "why did they
   do it this way?"
3. **Real trade-off** — there were genuine alternatives and one was picked
   for specific reasons.

If any condition is missing, skip the ADR. Format per
`~/.praxis/context-conventions.md` (Context, Decision, Consequences,
Status).

## Stop conditions

- User says "stop", "proceed-with-assumptions", or equivalent in another
  language. Exit immediately. Record the assumptions made into
  `CONTEXT.md` so the next session sees them.
- Eight questions reached without convergence. Escalate to the user: "We
  are stuck. Pick a direction or break this into a smaller scope."
- A decision requires human judgment only (legal, business, taste). Exit
  grilling and surface the decision as a direct question.

## What `CONTEXT.md` is and is not

`CONTEXT.md` is a glossary. One H2 per term, 1-3 sentences each, optional
"see also" links. It contains vocabulary, not implementation details. Do
not use it as a spec, a scratch pad, or a decision log — ADRs hold
decisions.

## Output of a session

The conversation outcome must survive the session. A grilling session that
does not update `CONTEXT.md` (when terms were resolved) or write an ADR
(when a decision met the three criteria) has failed its mechanism.
