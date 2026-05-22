# NOTICE — prototype

This skill (SKILL.md, LOGIC.md, UI.md) is lifted from `mattpocock/skills`
and adapted for praxis-ai.

## Upstream

- Repository: https://github.com/mattpocock/skills
- License: MIT
- Path: `skills/engineering/prototype/`
- Repo commit at lift: `b8be62ffacb0118fa3eaa29a0923c87c8c11985c`
- Author: Matt Pocock

## Per-file blob SHAs at lift

- `SKILL.md`: `64f3e61117b49c305e8d85b9c8543dcdfbb7d2c2`
- `LOGIC.md`: `526ecb18fb9a179dbb32392356b0e3ed3556911c`
- `UI.md`:    `f3b6e640222bf50c0a888136f2fbe595f2ff2b60`

## Modifications from upstream

All three files have been rewritten as procedural mechanism. Persona,
anecdote, and rhetorical emphasis are stripped; routing decisions,
constraints, and procedure are preserved. The prototype intent is
faithful.

Specific changes:

- Added `invocation: explicit` frontmatter to `SKILL.md` per
  `~/.praxis/skill-invocation-policy.md`. This skill is phase-marking
  and must never auto-invoke; the user invokes it via `/prototype` or
  when explicitly asking for a prototype.
- Routing logic in `SKILL.md` (LOGIC vs UI branch) is preserved
  unchanged in mechanism.
- `LOGIC.md` and `UI.md` are restructured to lead with mechanism and
  defer rationale; the original prose ordering favoured the rationale
  first. The end-state behaviour is identical.
- "Pseudo-code — adapt to the framework" examples retained because they
  are the mechanism, not the rationale.

## License notice

MIT License — Copyright (c) Matt Pocock and contributors. See
https://github.com/mattpocock/skills/blob/main/LICENSE for the full
licence text.

## Refresh

```
praxis sync-pocock
```
