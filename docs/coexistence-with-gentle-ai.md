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

## Plug-and-play bootstrap

As of 0.1.0-alpha.6, `praxis install` does not merely *detect* gentle-ai —
it **installs and configures it** so a single command leaves the user with
a fully working stack. This is opt-out via `--no-gentle-ai`.

praxis never vendors gentle-ai. It drives gentle-ai's own source-of-truth
tooling:

1. **Binary** — downloads gentle-ai's `scripts/install.sh` at runtime and
   runs it (brew tap or GitHub Releases binary). The script is fetched
   from the canonical raw URL, executed, and discarded. Skipped if the
   binary is already on PATH (unless `--force`).
2. **Ecosystem** — `gentle-ai install --agents claude-code --persona
   neutral --preset full-gentleman`. The `full-gentleman` preset pulls in
   all nine components: claude-theme, context7, persona, **engram**, gga,
   opencode-logo, permissions, sdd, skills. Model assignments default to
   **balanced** (gentle-ai's default when no model flags are passed: opus
   for architecture, sonnet for most phases, haiku for archiving).
3. **Strict TDD** — `gentle-ai sync --agents claude-code --strict-tdd`.
   The `install` subcommand does not expose a TDD flag; `sync` owns it, so
   praxis runs it as a second step.

### Applied configuration

| Setting | Value | How |
|---------|-------|-----|
| Agents | `claude-code` | `--agents` (override with `--ga-agents`) |
| Persona | `neutral` | `--persona` (override with `--ga-persona`) |
| Preset | `full-gentleman` | `--preset` (override with `--ga-preset`) |
| Models | `balanced` | gentle-ai default (no model flags) |
| Strict TDD | enabled | `gentle-ai sync --strict-tdd` (disable with `--no-strict-tdd`) |

### Respecting an existing configuration

If gentle-ai is already configured (its markers are present in
`CLAUDE.md`), the bootstrap is **skipped** so your existing persona,
preset, model, and TDD choices are untouched. Re-run with `--force` to
reapply the praxis defaults above. The bootstrap is also fully idempotent:
gentle-ai's `install`/`sync` are safe to re-run as updates.

### Failure handling

A gentle-ai bootstrap failure is **non-fatal**. Each step's failure is
collected as a warning and the praxis overlay still installs, so you are
never left without the firewall. The dependency preflight (see
[dependencies.md](dependencies.md)) runs first and aborts cleanly if a
required tool is missing — before any install side-effect.

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
