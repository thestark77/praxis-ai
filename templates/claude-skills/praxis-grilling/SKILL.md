---
name: praxis-grilling
description: Use when the user accepts or invokes /grill-with-docs, or when creating or updating CONTEXT.md, docs/adr/*.md or RTK.md in a project.
invocation: contextual
praxis-native: true
---

# Praxis-ai — Grilling and Project Context

How `/grill-with-docs` runs once accepted, and the per-project artefacts it writes
(`CONTEXT.md`, `docs/adr/*.md`, `RTK.md`).

## Praxis-ai — Grilling Procedure

This document defines how `/grill-with-docs` executes when invoked. The
sprint-mode classifier in `phase-flow.md` decides WHEN to suggest grilling;
this document defines HOW grilling actually runs once the user accepts.

### Goal

Surface ambiguities, build shared vocabulary, write the resulting
understanding to `CONTEXT.md` and (when an architectural decision is made)
to `docs/adr/*.md` so that the conversation outcome outlives the
conversation.

### Procedure

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

### Stop conditions

- User says "stop" or "proceed-with-assumptions" — exit immediately,
  proceed with reasonable defaults, document the assumptions explicitly in
  `CONTEXT.md` so the next session sees them.
- Eight questions reached without convergence — escalate to the user:
  "We are stuck. Either pick a direction or break this into a smaller
  scope."
- Critical ambiguity that requires user judgment only — exit grilling,
  surface the decision to the user as a direct question.

### What grilling is NOT

- Lecturing about why grilling matters. The user invoked it; they know.
- Asking trick questions or trying to "catch" the user.
- Adversarial. This is collaborative requirement extraction.
- A blocker. If the user wants to proceed with assumptions, honour it
  and document the assumptions.

## Praxis-ai — Project Context Conventions

This document defines the per-project artefact conventions that praxis-ai
uses to share vocabulary and decisions between humans, agents, and
sessions.

### `CONTEXT.md` (project root)

A shared vocabulary document, in the spirit of Domain-Driven Design. Built
collaboratively during `/grill-with-docs` sessions.

Format:

- One term per H2 section.
- Definition in 1-3 sentences.
- Optional "see also" linking related terms.

The `CONTEXT.md` is the most cost-effective compression technique in
praxis-ai's upstream sources: it lets subsequent prompts replace verbose
descriptions with established terms, saving tokens and reducing semantic
drift between human and agent.

### `docs/adr/NNNN-title.md` (project)

Architectural Decision Records. One file per substantive architectural
choice. Format (lifted from the conventional ADR template):

```
# NNNN — Title

## Context
What is the problem we are solving and what constraints apply.

## Decision
What we decided.

## Consequences
What follows from this decision, including known trade-offs.

## Status
proposed | accepted | superseded by NNNN
```

ADRs are immutable once accepted. Replace by writing a new ADR that
supersedes the old one (set `Status: superseded by NNNN` on the old).

### `RTK.md` (project root, optional)

If RTK (rtk-ai) is installed locally, praxis-ai may add a project-specific
`RTK.md` at the project root. This file is consumed by the RTK shell-output
compression layer and does not affect praxis-ai itself.
