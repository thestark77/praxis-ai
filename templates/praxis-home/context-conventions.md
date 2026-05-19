# Praxis-ai — Project Context Conventions

This document defines the per-project artefact conventions that praxis-ai
uses to share vocabulary and decisions between humans, agents, and
sessions.

## `CONTEXT.md` (project root)

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

## `docs/adr/NNNN-title.md` (project)

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

## `RTK.md` (project root, optional)

If RTK (rtk-ai) is installed locally, praxis-ai may add a project-specific
`RTK.md` at the project root. This file is consumed by the RTK shell-output
compression layer and does not affect praxis-ai itself.
