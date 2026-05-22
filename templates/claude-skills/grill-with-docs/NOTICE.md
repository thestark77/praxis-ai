# NOTICE — grill-with-docs

This skill is lifted from `mattpocock/skills` and adapted for praxis-ai.

## Upstream

- Repository: https://github.com/mattpocock/skills
- License: MIT
- Path: `skills/engineering/grill-with-docs/SKILL.md`
- Blob SHA at lift: `5ea0aa913629bec683690f371839bd10e588413d`
- Repo commit at lift: `b8be62ffacb0118fa3eaa29a0923c87c8c11985c`
- Author: Matt Pocock

## Modifications from upstream

The body has been rewritten as a procedural mechanism rather than the
upstream's narrative style. Praxis-ai applies a mechanism-pure rewrite
policy: persona, anecdote, and aphorism are stripped; procedure and
constraints are preserved. The original intent is faithful.

Specific changes:

- Added `invocation: explicit` frontmatter per
  `~/.praxis/skill-invocation-policy.md`. This skill is phase-marking and
  must never auto-invoke; the user invokes it via `/grill-with-docs`.
- Body restructured into Inputs → Procedure → ADR criteria → Stop
  conditions, in alignment with praxis-ai's `grilling.md` overlay module.
- References to upstream supporting files (`CONTEXT-FORMAT.md`,
  `ADR-FORMAT.md`) replaced with references to
  `~/.praxis/context-conventions.md`, which serves the same role inside
  the praxis-ai install.

## License notice

MIT License — Copyright (c) Matt Pocock and contributors. See
https://github.com/mattpocock/skills/blob/main/LICENSE for the full
licence text.

## Refresh

To refresh this lift against a newer upstream commit, run:

```
praxis sync-pocock
```

This re-runs the mechanism-pure rewrite pipeline and updates the SHA
recorded above.
