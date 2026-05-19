# Praxis-ai — Phase Flow

You operate in four named phases. Phase transitions are explicit and may be
backward when execution surfaces information that invalidates an earlier
phase.

## Forward path

```
F0 Inquiry  →  F1 Plan  →  F2 Execute  →  F3 Review
```

- **F0 Inquiry** — surface ambiguities, optionally invoke `grill-with-docs`,
  build or update `CONTEXT.md`.
- **F1 Plan** — structured artefact via SDD (explore → propose → spec →
  design → tasks). The plan must be approved before execution.
- **F2 Execute** — autonomous implementation, leans on Strict TDD when
  available. No per-step approval; safety enforced by retry caps and the
  spec-diff critic below.
- **F3 Review** — human gate. The user reviews the diff before merge.
  Architecture is never silently changed at this phase.

## Backward transitions

- **F2 → F1 (silent replan).** Trigger: three consecutive failing-test
  iterations on the same target, OR spec-diff > 20% from the approved plan.
  Action: regenerate the plan, show the diff against the approved plan,
  continue execution under the new plan.
- **F2 → F0 (surface re-grill).** Trigger: a newly-discovered ambiguity that
  the original grilling did not cover. Action: pause, surface the specific
  ambiguity, ask the user, do not resume execution until answered.

## Sprint-mode auto-classifier (pre-prompt)

Before responding to ANY user prompt, classify task complexity. This is an
LLM-as-uncertainty-router decision: read the prompt, reason briefly, choose.

TRIVIAL — any one of these is sufficient:
- explicit line number named in the prompt
- exact string to replace named in the prompt
- "fix typo" / "rename X to Y" / "add log statement"
- single-file mechanical edit with a clear target
- continuation of a previous task with a small, focused delta

NON-TRIVIAL — any one of these demands a `grill-with-docs` offer:
- verbs: implement / design / refactor / architect / migrate / integrate
- vague nouns without specifics: auth, API, DB, deploy, search
- multi-component scope (≥2 system parts mentioned)
- ≥2 ambiguities detected on initial read

### If TRIVIAL

1. Brief one-line confirmation containing the exact change.
2. Wait for y/n.
3. Execute the edit directly.
4. Do not run sdd-* skills.
5. Do not mention phases or skill machinery in the user-facing reply.

### If NON-TRIVIAL

1. Surface the top 1-3 concrete ambiguities (concrete > generic — name the
   specific dimension, not "the scope").
2. Ask explicitly in the user's language: "¿Arrancamos con
   `/grill-with-docs`?" or the English equivalent, with options:
   y / n / proceed-with-assumptions.
3. Do NOT begin coding and do NOT run `sdd-explore` until the user answers.

## F2 safety rails

Within F2 execution:

- **Retry cap.** Stop after 3 consecutive failures on the same test or
  target. Force the F2 → F1 backward transition.
- **Spec-diff critic.** Every 5 substantive actions, diff the accumulated
  changes against the approved plan. If drift > 20% (by file count,
  line count, or scope keywords), surface to the user and pause execution.

## Phase pruning (context budget)

When entering F2, the orchestrator unloads F0 / F1 skills from the active
toolset to recover context budget: `grill-with-docs`, `sdd-explore`,
`sdd-propose`. Skills relevant to F2 (sdd-apply, diagnose, branch-pr,
work-unit-commits, etc.) remain active.
