---
name: praxis-overlay-reference
description: Use when installing, debugging or editing the praxis overlay, or when praxis and gentle-ai instructions seem to conflict (placement rationale, standalone mode, the full balanced preset).
invocation: contextual
praxis-native: true
---

# Praxis-ai — Overlay Reference

Rationale and edge cases that do not need to be in every turn. The always-loaded
layer keeps the rules themselves; this holds the detail behind them.

## Precedence detail

### Mechanical precedence

Praxis-ai's CLAUDE.md block is inserted last in the file, after all
gentle-ai blocks. The model gives more weight to instructions that appear
later in the prompt (recency effect, well-documented in
`Berglund et al. — Reversal Curse, 2023`). This positional choice is the
primary enforcement mechanism, not a coincidence.

### What praxis-ai does NOT touch

- Gentle-ai's persona block. The user owns persona; praxis-ai is silent.
- Gentle-ai's engram protocol. Untouched; praxis-ai uses the same memory
  layer additively.
- Gentle-ai's SDD orchestrator instructions. Untouched; praxis-ai defers to
  SDD for the F1 and F2 ceremony once the user has approved entering them.
- Gentle-ai's marker contract (`<!-- gentle-ai:* -->`). Praxis-ai uses its
  own markers (`<!-- praxis:start -->` / `<!-- praxis:end -->`) and never
  modifies gentle-ai's.

### Stand-alone mode (when gentle-ai is absent)

If gentle-ai is not installed, praxis-ai operates in degraded standalone
mode: the firewall, lifted skills (when invoked explicitly), telemetry, and
precedence rules still function. The SDD lifecycle and Strict TDD
enforcement are unavailable; phases F1 and F2 collapse into informal
planning + execution without the SDD scaffolding.

## Praxis-ai — Preset: balanced (default)

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

### Sprint-mode default behaviour

Enabled. The auto-classifier decides whether to apply sprint-mode or
suggest `grill-with-docs`. Threshold: NON-TRIVIAL if ≥2 signals are
detected from the lists in `phase-flow.md`.

### Context-budget warnings

Poll the user between 50% and 60% of effective context capacity (typically
~20k-24k tokens for common Claude Code session shapes) instead of warning at
a single fixed threshold. See the `praxis-context-guard` skill for the full poll-window
and context-guard protocol.

### Firewall

Full default deny list active in `~/.claude/settings.json`. AST PreToolUse
hook active when Claude Code supports it. Anticipatory pauses for
production deploys, unbounded DB writes, cloud terminate/delete, payment,
billing, and shared CI/CD config changes.

### What the balanced preset is NOT

- Not "interactive" mode — that is a separate preset (deferred to v0.2)
  with stricter grilling defaults and more frequent human gates.
- Not "autonomous" mode — that is a separate preset (deferred to v0.2)
  with relaxed grilling and fewer pre-execution interrupts.

The balanced preset is the recommended starting point. Switch via
`praxis preset <name>` once v0.2 ships additional presets.
