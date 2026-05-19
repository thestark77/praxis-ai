# T9 — Skill discovery — six lifted skills are present

## Covers
- The install pipeline copies the six lifted skills to `~/.claude/skills/`.
- Each ships SKILL.md + NOTICE.md.
- prototype/ also ships LOGIC.md + UI.md.

## Setup
- Dogfood install active.

## Action
A sub-agent reads `~/.claude/skills/` and lists the six lifted skill dirs.

## Expected
All six are present with the expected files.

## Verification
- ls of `~/.claude/skills/` contains:
  `grill-with-docs`, `caveman`, `diagnose`, `zoom-out`, `prototype`, `handoff`.
- Each contains `SKILL.md` and `NOTICE.md`.
- prototype/ also contains `LOGIC.md` and `UI.md`.
- Each `NOTICE.md` references `mattpocock/skills` and `MIT`.
