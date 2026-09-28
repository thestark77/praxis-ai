# Praxis-ai — Preset: balanced (default)

The `balanced` preset is the v0.1 default. It implements phase-dependent
autonomy:

- **F0 Inquiry**: high interaction. Sprint-mode classifier may collapse F0
  into a 30-second intent-confirm for trivial tasks. For non-trivial
  tasks, `grill-with-docs` is suggested.
- **F1 Plan**: structured artefact via SDD. The plan must be approved
  before execution.
- **F2 Execute**: high autonomy. No per-step approval. Strict TDD when
  active. Retry cap and spec-diff critic apply.
- **F3 Review**: human gate. User reviews the diff before merge.

## Sprint-mode default behaviour

Enabled. The auto-classifier decides whether to apply sprint-mode or
suggest `grill-with-docs`. Threshold: NON-TRIVIAL if ≥2 signals are
detected from the lists in `phase-flow.md`.

## Context-budget warnings

Poll the user between 50% and 60% of effective context capacity (typically
~20k-24k tokens for common Claude Code session shapes) instead of warning at
a single fixed threshold. See `context-budget.md` for the full poll-window
and context-guard protocol.

## Firewall

Full default deny list active in `~/.claude/settings.json`. AST PreToolUse
hook active when Claude Code supports it. Anticipatory pauses for
production deploys, unbounded DB writes, cloud terminate/delete, payment,
billing, and shared CI/CD config changes.

## What the balanced preset is NOT

- Not "interactive" mode — that is a separate preset (deferred to v0.2)
  with stricter grilling defaults and more frequent human gates.
- Not "autonomous" mode — that is a separate preset (deferred to v0.2)
  with relaxed grilling and fewer pre-execution interrupts.

The balanced preset is the recommended starting point. Switch via
`praxis preset <name>` once v0.2 ships additional presets.
