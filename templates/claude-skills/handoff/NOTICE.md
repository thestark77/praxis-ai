# NOTICE — handoff

This skill is lifted from `mattpocock/skills` and adapted for praxis-ai.

## Upstream

- Repository: https://github.com/mattpocock/skills
- License: MIT
- Path: `skills/productivity/handoff/SKILL.md`
- Blob SHA at lift: `0aa5b99300da27b50e80db53f880e422204faedd`
- Repo commit at lift: `b8be62ffacb0118fa3eaa29a0923c87c8c11985c`
- Author: Matt Pocock

## Modifications from upstream

The upstream skill is short and procedural already. The lift applies
praxis-ai's mechanism-pure rewrite policy by expanding the body into an
explicit document-section enumeration (Goal, State, Decisions, Open
questions, Next steps, Suggested skills) so the agent output is
consistent across sessions. Persona and free-form prose are stripped;
the procedural mechanism is preserved.

Specific changes:

- Added `invocation: explicit` frontmatter per
  `~/.praxis/skill-invocation-policy.md`. This skill is phase-marking
  and must never auto-invoke; the user invokes it via `/handoff`.
- Preserved the `argument-hint` field unchanged.
- Made the "no duplication" rule explicit as a separate procedural step.

Re-lifted from the upstream revision that:
- Saves to the OS temporary directory (not the workspace) instead of a
  fixed `mktemp` path.
- Adds an explicit redaction step (no API keys, passwords, tokens, or
  PII in the handoff document).
- Frames the suggested skills as a dedicated document section.

## License notice

MIT License — Copyright (c) Matt Pocock and contributors. See
https://github.com/mattpocock/skills/blob/main/LICENSE for the full
licence text.

## Refresh

```
praxis sync-pocock
```
