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

## In genuine conflict

If gentle-ai instructs an action that praxis-ai blocks (for example,
gentle-ai says "be autonomous" but praxis-ai requires confirmation on an
irreversible action), praxis-ai wins. The user can override praxis-ai with
explicit confirmation; gentle-ai cannot.

## Boundaries

Praxis-ai never modifies gentle-ai's persona block, engram protocol, SDD
orchestrator instructions, or `<!-- gentle-ai:* -->` markers. Why the praxis
block is placed last, standalone mode without gentle-ai, and the full
boundary list: skill `praxis-overlay-reference`.
