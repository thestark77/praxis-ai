# NOTICE — zoom-out

This skill is lifted from `mattpocock/skills` and adapted for praxis-ai.

## Upstream

- Repository: https://github.com/mattpocock/skills
- License: MIT
- Path: `skills/engineering/zoom-out/SKILL.md`
- Blob SHA at lift: `1e7a5dc728fed0a85a28c9dfb6e78ce5a81da7db`
- Repo commit at lift: `b8be62ffacb0118fa3eaa29a0923c87c8c11985c`
- Author: Matt Pocock

## Modifications from upstream

The upstream skill is intentionally tiny: a single instructional
paragraph. The lift expands the body into a procedural mechanism that
specifies what "zoom out one layer" means in operational terms, while
preserving the upstream's minimalist intent.

Specific changes:

- The upstream `disable-model-invocation: true` declaration is kept
  **alongside** praxis-ai's `invocation: explicit` field. An earlier lift
  replaced it, treating the two as equivalent; they are not. `invocation:
  explicit` is a praxis vocabulary field that only the overlay prose
  enforces, while `disable-model-invocation` is enforced by Claude Code
  itself ("prevent Claude from automatically loading this skill", skills
  reference). A phase-marking skill must not depend on the model choosing
  to obey, so both are declared: the native key enforces, the praxis
  field keeps the policy readable across harnesses.
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
