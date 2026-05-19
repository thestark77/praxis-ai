# Praxis-ai — Precedence Rules

When praxis-ai instructions conflict with other CLAUDE.md instructions
(notably gentle-ai blocks), resolve the conflict by these rules.

## Domain ownership

- **Praxis-ai governs**: task startup, safety boundary (the firewall), phase
  classification (trivial vs non-trivial), backward transitions, context
  budget warnings, local telemetry.
- **Gentle-ai governs**: SDD lifecycle inside the plan (explore → propose →
  spec → design → tasks → apply → verify → archive), Strict TDD enforcement,
  Engram protocol, skill-registry compact-rule injection, sub-agent
  delegation.

## Mechanical precedence

Praxis-ai's CLAUDE.md block is inserted last in the file, after all
gentle-ai blocks. The model gives more weight to instructions that appear
later in the prompt (recency effect, well-documented in
`Berglund et al. — Reversal Curse, 2023`). This positional choice is the
primary enforcement mechanism, not a coincidence.

## In genuine conflict

If gentle-ai instructs an action that praxis-ai blocks (for example,
gentle-ai says "be autonomous" but praxis-ai requires confirmation on an
irreversible action), praxis-ai wins. The user can override praxis-ai with
explicit confirmation; gentle-ai cannot.

## What praxis-ai does NOT touch

- Gentle-ai's persona block. The user owns persona; praxis-ai is silent.
- Gentle-ai's engram protocol. Untouched; praxis-ai uses the same memory
  layer additively.
- Gentle-ai's SDD orchestrator instructions. Untouched; praxis-ai defers to
  SDD for the F1 and F2 ceremony once the user has approved entering them.
- Gentle-ai's marker contract (`<!-- gentle-ai:* -->`). Praxis-ai uses its
  own markers (`<!-- praxis:start -->` / `<!-- praxis:end -->`) and never
  modifies gentle-ai's.

## Stand-alone mode (when gentle-ai is absent)

If gentle-ai is not installed, praxis-ai operates in degraded standalone
mode: the firewall, lifted skills (when invoked explicitly), telemetry, and
precedence rules still function. The SDD lifecycle and Strict TDD
enforcement are unavailable; phases F1 and F2 collapse into informal
planning + execution without the SDD scaffolding.
