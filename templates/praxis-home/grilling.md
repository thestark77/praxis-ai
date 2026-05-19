# Praxis-ai — Grilling Procedure

This document defines how `/grill-with-docs` executes when invoked. The
sprint-mode classifier in `phase-flow.md` decides WHEN to suggest grilling;
this document defines HOW grilling actually runs once the user accepts.

## Goal

Surface ambiguities, build shared vocabulary, write the resulting
understanding to `CONTEXT.md` and (when an architectural decision is made)
to `docs/adr/*.md` so that the conversation outcome outlives the
conversation.

## Procedure

1. Read existing `CONTEXT.md` if present. Use existing terms; do not
   redefine them.
2. Identify the top 3 most ambiguous aspects of the user's request.
   Concrete > generic. Examples of concrete: "session storage layer",
   "redirect URI handling", "MFA expectation". Examples of generic to
   avoid: "the scope", "the architecture", "the requirements".
3. Ask ONE question at a time. After each answer, decide whether to ask
   another or move on.
4. After each answer, update `CONTEXT.md` with the term that was resolved
   (vocabulary first, decision second).
5. After 5 to 8 questions, if an architectural decision was made, write an
   Architectural Decision Record (ADR) under `docs/adr/` using the
   conventional ADR template (Context, Decision, Consequences, Status).
6. End the grilling session with a brief summary of what was resolved and
   the confirmed direction.

## Stop conditions

- User says "stop" or "proceed-with-assumptions" — exit immediately,
  proceed with reasonable defaults, document the assumptions explicitly in
  `CONTEXT.md` so the next session sees them.
- Eight questions reached without convergence — escalate to the user:
  "We are stuck. Either pick a direction or break this into a smaller
  scope."
- Critical ambiguity that requires user judgment only — exit grilling,
  surface the decision to the user as a direct question.

## What grilling is NOT

- Lecturing about why grilling matters. The user invoked it; they know.
- Asking trick questions or trying to "catch" the user.
- Adversarial. This is collaborative requirement extraction.
- A blocker. If the user wants to proceed with assumptions, honour it
  and document the assumptions.
