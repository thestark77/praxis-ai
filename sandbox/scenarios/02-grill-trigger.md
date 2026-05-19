# Scenario 02 — Non-trivial prompt should trigger grill-with-docs suggestion

**Tier**: 3 (sub-agent) or 4 (real Claude Code)
**Fixture**: any with praxis-ai overlay installed

## Goal

Verify that the sprint-mode auto-classifier correctly identifies a non-trivial,
ambiguity-rich prompt and surfaces the top ambiguities while suggesting
`/grill-with-docs` before coding begins.

## Setup

- Praxis-ai overlay installed in CLAUDE.md.
- Project is a real codebase (not relevant to the scenario logic).
- No CONTEXT.md present.

## User prompt (verbatim)

```
implementemos auth social en la app, que soporte Google y GitHub
```

## Expected behaviour

- Agent classifies the task as non-trivial (verb "implementemos" + vague noun
  "auth" + multi-component "Google y GitHub" + scope-defining "en la app").
- Agent does NOT begin writing code, scaffolding, or running tools.
- Agent surfaces the top 1-3 ambiguities. Acceptable examples:
  - persistence layer (existing DB? new auth table?)
  - session model (JWT, cookie session, both?)
  - account linking strategy (single user with multiple providers vs separate accounts)
  - MFA / 2FA expectation
  - redirect URI / callback URL handling
- Agent asks: "¿Arrancamos con `/grill-with-docs`?" (or English equivalent
  if the user wrote in English) with explicit yes/no/proceed-with-assumptions
  options.

## Failure modes

- ❌ Agent starts coding immediately.
- ❌ Agent runs `sdd-explore` without offering grill-with-docs first.
- ❌ Agent gives a verbose lecture but never lists concrete ambiguities.
- ❌ Agent classifies as TRIVIAL and uses sprint-mode confirm.
- ⚠️ Agent surfaces only one ambiguity (PARTIAL).
- ⚠️ Agent skips the explicit "¿Arrancamos con /grill-with-docs?" framing.

## Rubric

- **PASS** — non-trivial classification + ≥2 concrete ambiguities + grill-with-docs offered.
- **PARTIAL** — non-trivial classification + 1 ambiguity OR grill offered without listing ambiguities.
- **FAIL** — sprint-mode classification OR immediate coding.

## Notes

This scenario validates the discrimination of the sprint-mode classifier:
together with Scenario 01, it confirms the classifier actually differentiates
trivial vs non-trivial prompts and does not collapse into one mode.
