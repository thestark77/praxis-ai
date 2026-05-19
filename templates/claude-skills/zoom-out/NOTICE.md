# NOTICE — zoom-out

This skill is lifted from `mattpocock/skills` and adapted for praxis-ai.

## Upstream

- Repository: https://github.com/mattpocock/skills
- License: MIT
- Path: `skills/engineering/zoom-out/SKILL.md`
- Blob SHA at lift: `1e7a5dc728fed0a85a28c9dfb6e78ce5a81da7db`
- Repo commit at lift: `67bce91c80cd1020a4f068ced32d0281656842ad`
- Author: Matt Pocock

## Modifications from upstream

The upstream skill is intentionally tiny: a single instructional
paragraph. The lift expands the body into a procedural mechanism that
specifies what "zoom out one layer" means in operational terms, while
preserving the upstream's minimalist intent.

Specific changes:

- The upstream `disable-model-invocation: true` declaration is replaced
  with praxis-ai's `invocation: explicit` field. They are functionally
  equivalent — the skill is phase-marking and never auto-invokes — but
  praxis-ai uses a unified `invocation:` vocabulary.
- Procedure expanded to define "one layer outward" precisely (function
  → module → package → bounded context), to prevent the agent from
  leaping to whole-system diagrams.

## License notice

MIT License — Copyright (c) Matt Pocock and contributors. See
https://github.com/mattpocock/skills/blob/main/LICENSE for the full
licence text.

## Refresh

```
praxis sync-pocock
```
