# NOTICE — prototype

This skill (SKILL.md, LOGIC.md, UI.md) is lifted from `mattpocock/skills`
and adapted for praxis-ai.

## Upstream

- Repository: https://github.com/mattpocock/skills
- License: MIT
- Path: `skills/engineering/prototype/`
- Repo commit at lift: `84fdeffd12f2ee307994d1eb6feb48173b6e0502`
- Author: Matt Pocock

## Per-file blob SHAs at lift

- `SKILL.md`: `094571156140f5993cce8557dc31383c82817f3e`
- `LOGIC.md`: `5f5a3fd5a8cbd69c029854e9881ddc6e87ae5093`
- `UI.md`:    `76c0f6012b016af04d6105fa696a9a0e29dfa53a`

## Modifications from upstream

All three files have been rewritten as procedural mechanism. Persona,
anecdote, and rhetorical emphasis are stripped; routing decisions,
constraints, and procedure are preserved. The prototype intent is
faithful.

Specific changes:

- Added `invocation: explicit` frontmatter to `SKILL.md` per
  `~/.praxis/skill-invocation-policy.md`, alongside Claude Code's native
  `disable-model-invocation: true` so the policy is enforced by the
  harness and not only documented. This skill is phase-marking and must
  never auto-invoke; the user invokes it via `/prototype` or when
  explicitly asking for a prototype.
- Routing logic in `SKILL.md` (LOGIC vs UI branch) is preserved
  unchanged in mechanism.
- `LOGIC.md` and `UI.md` are restructured to lead with mechanism and
  defer rationale; the original prose ordering favoured the rationale
  first. The end-state behaviour is identical.
- "Pseudo-code — adapt to the framework" examples retained because they
  are the mechanism, not the rationale.

Re-lifted from the upstream revision that:

- Replaces the LOGIC branch's terminal app with a single self-contained
  HTML demo — free-play buttons plus tabbed guided walkthroughs — so a
  non-developer can drive the state model. The purity boundary is
  unchanged: the page is a thin shell over a liftable pure module, with
  "no terminal code in the module" becoming "no DOM in the module".
- Reframes the run rule from "one command" to "trivial to run", because
  the two branches now start differently (task runner vs double-click).
- Treats the prototype as a **primary source**: the validated decision is
  absorbed into the main branch, the prototype itself is committed to a
  throwaway branch with a pointer from the implementation issue, instead
  of being deleted outright.

## License notice

MIT License — Copyright (c) Matt Pocock and contributors. See
https://github.com/mattpocock/skills/blob/main/LICENSE for the full
licence text.

## Refresh

```
praxis sync-pocock
```
