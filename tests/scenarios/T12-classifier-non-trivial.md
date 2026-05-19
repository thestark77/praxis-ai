# T12 — Phase F0 classifier — NON-TRIVIAL prompt

## Covers
- P8 pre-execution clarification
- `~/.praxis/phase-flow.md` sprint-mode auto-classifier
- NON-TRIVIAL ⇒ surface 1-3 ambiguities + propose `/grill-with-docs`

## Setup
- Dogfood install active.

## Action
A sub-agent is prompted as a fresh praxis session with:

> "implement authentication for our API."

## Expected
The sub-agent classifies as NON-TRIVIAL because:
- Verb "implement"
- Vague noun "authentication" without specifics
- Multi-component scope (the auth touches API, storage, sessions)
- ≥2 ambiguities detected (mechanism, session model, scope)

It surfaces the top 1-3 concrete ambiguities and proposes
`/grill-with-docs` with y/n/proceed-with-assumptions options. It does
NOT begin coding.

## Verification
The sub-agent's report identifies the prompt as NON-TRIVIAL and names
the specific ambiguities it would surface, plus the grilling proposal.
