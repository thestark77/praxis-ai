# Coexistence with gentle-ai

praxis-ai is designed to live alongside gentle-ai cleanly. No fork, no
patch, no shared mutable state. This document explains the boundaries.

## Domain ownership

- **praxis-ai governs**: task startup classification (trivial vs
  non-trivial), phase flow (F0/F1/F2/F3) and backward transitions,
  the irreversibility firewall (deny list + AST hook), context-budget
  warnings, the balanced preset, the lifted skill invocation policy,
  and the local SQLite telemetry.
- **gentle-ai governs**: the SDD lifecycle inside the plan
  (explore → propose → spec → design → tasks → apply → verify →
  archive), Strict TDD enforcement, the engram persistent-memory
  protocol, the skill-registry compact-rule injection, and sub-agent
  delegation orchestration.

The two systems are orthogonal. praxis defines **when** to plan and
**when** to stop; gentle-ai defines **how** to execute the plan.

## Mechanical precedence

praxis-ai's CLAUDE.md block is inserted **after** gentle-ai's blocks.
Claude Code applies a recency effect to instruction order
([Berglund et al. 2023, Reversal Curse](references.md)), so the block
that appears later wins on direct conflict. This is the primary
enforcement mechanism.

In practice the two rarely conflict because they govern different
domains. When they do, praxis-ai wins by design — and the user can
override praxis with explicit confirmation; gentle-ai cannot.

## Detection logic

`praxis install` runs `detect()` to classify the environment into one
of four modes:

| Mode | gentle-ai binary | gentle-ai blocks in CLAUDE.md | Behaviour |
|---|---|---|---|
| `overlay` | yes | yes | Full overlay. praxis layers on top of gentle-ai. Recommended. |
| `partial-overlay` | yes | no | Binary present but not initialised. praxis installs; doctor reports missing pieces. |
| `standalone` | no | no | praxis runs without SDD or Strict TDD. Firewall, lifted skills, telemetry, AST hook still work. |
| `no-claude-code` | n/a | n/a | `~/.claude/` does not exist. Install aborts with instructions to run `claude` once first. |

## What praxis-ai does NOT touch

- **gentle-ai's persona block.** The user owns persona; praxis-ai is
  silent.
- **gentle-ai's engram protocol.** Untouched. praxis-ai uses the same
  memory layer additively — both systems write to engram with their
  own topic-key conventions.
- **gentle-ai's SDD orchestrator instructions.** Untouched. praxis-ai
  defers to SDD for F1 and F2 ceremony once the user has approved
  entering them.
- **gentle-ai's marker contract** (`<!-- gentle-ai:* -->`). praxis-ai
  uses its own markers (`<!-- praxis:start -->` / `<!-- praxis:end -->`)
  and never modifies gentle-ai's.

## What gentle-ai users gain from praxis

- **Pre-execution clarification.** gentle-ai's SDD assumes a plan
  exists. praxis-ai's F0 inquiry / `/grill-with-docs` produces the
  pre-plan vocabulary so SDD has cleaner inputs.
- **Hard irreversibility containment.** gentle-ai trusts the model to
  not push --force; praxis-ai blocks it at the permission layer and
  again at the AST layer.
- **Local telemetry.** praxis-ai surfaces tool-invocation patterns,
  deny hits, and context-usage samples that gentle-ai does not.

## What praxis users gain by adding gentle-ai

- **SDD lifecycle.** Multi-component changes get a structured
  proposal → spec → design → tasks → apply → verify pipeline.
- **Strict TDD enforcement.** A test runner is detected, cached, and
  enforced as a gate during apply.
- **Engram persistent memory.** Cross-session learning, decision
  history, and conflict surfacing.

## Stand-alone mode

If gentle-ai is absent, praxis-ai operates in degraded standalone
mode. The firewall, lifted skills, AST hook, telemetry, and
precedence rules still function. The SDD lifecycle and Strict TDD
enforcement are unavailable; phases F1 and F2 collapse into informal
planning + execution without the SDD scaffolding.

Standalone mode is a useful test environment but not the recommended
production setup. The full overlay (praxis + gentle-ai + engram) is.
