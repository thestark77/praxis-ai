# Praxis-ai — Preset: balanced (default)

The `balanced` preset is the v0.1 default: phase-dependent autonomy, with the
sprint-mode classifier from `phase-flow.md` enabled.

- **F0 Inquiry**: high interaction. Trivial tasks collapse to a 30-second
  intent-confirm; non-trivial ones get a `grill-with-docs` offer
  (NON-TRIVIAL if ≥2 signals are detected from the lists in `phase-flow.md`).
- **F1 Plan**: structured artefact via SDD, approved before execution.
- **F2 Execute**: high autonomy, no per-step approval, Strict TDD when
  active; retry cap and spec-diff critic apply.
- **F3 Review**: human gate; the user reviews the diff before merge.

Context budget: poll the user between 50% and 60% of effective context
capacity, not at a single fixed threshold (skill `praxis-context-guard`).
Firewall: full default deny list and AST hook, plus the anticipatory pauses in
`irreversibility-firewall.md`.

The full preset text, including what `balanced` is NOT, is in skill
`praxis-overlay-reference`.
