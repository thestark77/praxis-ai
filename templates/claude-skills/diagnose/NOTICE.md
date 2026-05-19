# NOTICE — diagnose

This skill is lifted from `mattpocock/skills` and adapted for praxis-ai.

## Upstream

- Repository: https://github.com/mattpocock/skills
- License: MIT
- Path: `skills/engineering/diagnose/SKILL.md`
- Blob SHA at lift: `ed55bda2fdb0d690ea3b80a1cf28bf848c5ad2b5`
- Repo commit at lift: `67bce91c80cd1020a4f068ced32d0281656842ad`
- Author: Matt Pocock

## Modifications from upstream

The body has been rewritten as a procedural mechanism. Persona,
exhortation, and rhetorical emphasis are stripped; phases, criteria, and
ordering are preserved. The diagnostic intent is faithful.

Specific changes:

- Added `invocation: reflex` and a `triggers:` block per
  `~/.praxis/skill-invocation-policy.md`. Praxis-ai treats diagnose as a
  reflex skill that auto-fires on an objective signal (two consecutive
  command failures in F2 execution) in addition to the upstream's
  user-utterance triggers.
- Rationale: praxis-ai's F2 execution phase already tracks consecutive
  failures (see `phase-flow.md` retry cap). Auto-invoking diagnose at the
  second failure routes the agent into a disciplined loop before the
  third failure forces a backward transition to F1.
- The upstream's optional `scripts/hitl-loop.template.sh` reference is
  preserved as a procedural mention (last-resort HITL bash script) but
  the file is not bundled. The praxis overlay does not ship the script.

## License notice

MIT License — Copyright (c) Matt Pocock and contributors. See
https://github.com/mattpocock/skills/blob/main/LICENSE for the full
licence text.

## Refresh

```
praxis sync-pocock
```
