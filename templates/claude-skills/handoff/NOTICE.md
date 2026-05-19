# NOTICE — handoff

This skill is lifted from `mattpocock/skills` and adapted for praxis-ai.

## Upstream

- Repository: https://github.com/mattpocock/skills
- License: MIT
- Path: `skills/productivity/handoff/SKILL.md`
- Blob SHA at lift: `28bfb3ab133fe58fd6da8a2a13b3ed2450a2f8b2`
- Repo commit at lift: `67bce91c80cd1020a4f068ced32d0281656842ad`
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
- Made the "no duplication" rule explicit as a separate procedural step
  with In/Out enumeration.

## License notice

MIT License — Copyright (c) Matt Pocock and contributors. See
https://github.com/mattpocock/skills/blob/main/LICENSE for the full
licence text.

## Refresh

```
praxis sync-pocock
```
