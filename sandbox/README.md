# praxis-ai sandbox

Manual + sub-agent-driven test scenarios for verifying praxis-ai behavior in
real or simulated environments.

This directory complements the automated test suite in `tests/`:

| Tier | Location | What it tests | Automation |
|------|----------|---------------|------------|
| 1 — Unit | `tests/lib/` | Pure functions, individual modules | CI |
| 2 — Integration | `tests/integration/` | Multi-lib flows on the filesystem | CI |
| 3 — Sandbox (sub-agent) | `sandbox/scenarios/` | praxis-ai instruction layer in a Claude sub-agent | Manual / dev only |
| 4 — Sandbox (Claude Code) | `sandbox/scenarios/` | Real praxis-ai install in a sandbox project | Manual / dev only |

## Why separate from `tests/`

The `sandbox/` scenarios are **not** auto-runnable in CI. They depend either on:

- a Claude orchestrator agent that can spawn sub-agents (Tier 3), or
- a local Claude Code installation with API credentials (Tier 4).

Both modes are valuable for confidence but unsuitable for automated regression
gates on every commit. They are runnable on demand during development and
release-readiness checks.

## Scope of what each tier can verify

| Praxis behavior | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| Marker injection / removal idempotency | ✅ | ✅ | — | ✅ |
| Settings deny merge / unmerge | ✅ | ✅ | — | ✅ |
| Multi-file install state | — | ✅ | — | ✅ |
| Backup / rollback round trip | ✅ | ✅ | — | ✅ |
| Detection of gentle-ai / engram | ✅ | ✅ | — | ✅ |
| Sprint-mode classification on trivial prompts | — | — | ✅ | ✅ |
| Grill-with-docs suggestion on ambiguous prompts | — | — | ✅ | ✅ |
| Phase precedence over gentle-ai | — | — | ✅ | ✅ |
| Context budget warning | — | — | partial | ✅ |
| F2 retry-cap + spec-diff critic | — | — | partial | ✅ |
| Firewall hard-deny enforcement | — | — | ❌ | ✅ |
| AST-level command inspection | — | — | ❌ | ✅ |

Tier 3 cannot verify settings.json-level firewall enforcement because the
sub-agent does not load the orchestrator's local settings. For full
firewall validation, use Tier 4 with a real Claude Code installation.

## Scenario structure

Each scenario in `sandbox/scenarios/` is a single Markdown file with:

- **Goal** — what behavior we are testing
- **Fixture** — which sandbox fixture state to use
- **Setup** — concrete steps to prepare the environment
- **User prompt** — the verbatim prompt to submit (acting as the user)
- **Expected behavior** — bullets of the right reaction
- **Failure modes** — bullets of red-flag behaviors that mean FAIL
- **Rubric** — PASS / PARTIAL / FAIL definitions

Scenarios are versioned alongside the code. New praxis-ai features add
scenarios; the catalog grows.

## How to run a scenario (Tier 3 — sub-agent)

From a Claude Code orchestrator session:

1. Read the scenario file.
2. Construct a sub-agent prompt that injects the relevant praxis-ai
   instructions as context plus the user prompt from the scenario.
3. Spawn the sub-agent.
4. Compare its response against the scenario's rubric.
5. Record the result in `sandbox/results/<date>/<scenario>.md`.

## How to run a scenario (Tier 4 — real Claude Code)

1. Run `sandbox/scripts/create-sandbox.sh <fixture>` to materialise a
   sandbox project directory.
2. Run `npx praxis-ai@latest install` inside the sandbox.
3. Open Claude Code rooted at the sandbox directory.
4. Submit the user prompt from the scenario.
5. Compare the response against the rubric.
6. Tear down with `sandbox/scripts/reset-sandbox.sh <fixture>`.

## Fixtures (planned)

- `empty/` — no Claude Code config (worst-case standalone install)
- `gentleai-only/` — gentle-ai installed without sdd-init
- `gentleai-sdd-init/` — full gentle-ai + sdd-init + Strict TDD
- `adversarial/` — repo content tries prompt injection
- `pre-installed-praxis/` — overlay already present (idempotency check)

Fixtures will land alongside the install command (M1).
