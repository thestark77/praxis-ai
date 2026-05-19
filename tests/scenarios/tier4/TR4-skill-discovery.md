# TR4 — Skill discovery in a fresh session

## Covers
- The lifted skills are loaded into a fresh Claude Code session
- Skill names visible to the model from a clean install

## Prompt
See `TR4-skill-discovery.prompt.txt`.

## Expected
The model lists at least 4 of the 6 lifted skill names by name:
`grill-with-docs`, `caveman`, `diagnose`, `zoom-out`, `prototype`,
`handoff`. (4-of-6 threshold accounts for the model abbreviating or
grouping.)

## Assertion
`TR4-skill-discovery-assert.sh` counts how many of the six names appear
in the response and asserts at least 4.
