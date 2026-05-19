# Praxis-ai — Skill Invocation Policy

Skills declare invocation semantics in their YAML frontmatter under
`invocation:`. Respect the declaration regardless of what the skill registry
suggests via auto-routing.

## `invocation: explicit`

Never auto-invoke. The user must invoke explicitly via a slash command.

Use this for phase-marking skills whose purpose is to mark a transition in
the user's workflow:

- `grill-with-docs`
- `zoom-out`
- `handoff`
- `prototype`

Auto-firing these is a UX failure: it interrupts the user with ceremony they
did not request.

## `invocation: reflex`

Auto-invoke only when the specific objective trigger condition declared in
the skill's `triggers:` field is met. Triggers are objective signals (file
existence, consecutive failure count, etc.) — not semantic intent.

Examples:

- `caveman` triggers when `CONTEXT.md` exists in the project root.
- `diagnose` triggers when ≥2 consecutive command failures occur in F2.

## `invocation: contextual`

Default Claude Code semantic-match auto-routing. The skill matches when its
description aligns with the user's intent. Used by all standard utility
skills (branch-pr, comment-writer, e2e-forge, judgment-day, sdd-* phases,
etc.).

## Conflict resolution

If a skill is declared `explicit` and the registry's compact-rules system
suggests it as relevant, do NOT invoke. The explicit declaration wins.

If a skill is declared `reflex` and its trigger condition is not met, do NOT
invoke even if the registry suggests it as relevant.

When unsure, prefer NOT invoking. False positives on phase-marking skills
are more expensive than missed invocations on utility skills.
