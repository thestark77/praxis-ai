# NOTICE — caveman

This skill is lifted from `mattpocock/skills` and adapted for praxis-ai.

## Upstream

- Repository: https://github.com/mattpocock/skills
- License: MIT
- Path: `skills/productivity/caveman/SKILL.md`
- Blob SHA at lift: `85770a38992a7c74d2b3467b03fe5bd4b1287fe6`
- Repo commit at lift: `b8be62ffacb0118fa3eaa29a0923c87c8c11985c`
- Author: Matt Pocock

## Modifications from upstream

The body has been rewritten as a procedural mechanism. Persona,
anecdote, and aphorism are stripped; procedure and rules are preserved.
The compression intent is faithful.

Specific changes:

- Added `invocation: reflex` and a `triggers:` block per
  `~/.praxis/skill-invocation-policy.md`. Praxis-ai treats caveman as a
  reflex skill that auto-fires on an objective signal (`CONTEXT.md`
  presence at project root) in addition to the upstream's user-utterance
  triggers.
- Rationale: a project that maintains a shared `CONTEXT.md` glossary has
  invested in compressed vocabulary; verbose restatement is wasteful. The
  file-existence signal is objective and predictable, which is what
  `reflex` invocation requires.
- The upstream `disable-model-invocation` style declaration is replaced
  by praxis-ai's `invocation:` field, which the praxis overlay enforces.

## License notice

MIT License — Copyright (c) Matt Pocock and contributors. See
https://github.com/mattpocock/skills/blob/main/LICENSE for the full
licence text.

## Refresh

```
praxis sync-pocock
```
