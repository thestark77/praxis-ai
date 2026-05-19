# Tier 4 — real `claude --print` subprocess in isolated HOME

Tier 4 spawns a real Claude Code session as a subprocess (`claude
--print -p "<prompt>"`) inside a fresh sandbox `HOME`. Unlike Tier 3
sub-agents (which inherit the parent's session and context), each
Tier 4 invocation is a true cold session. This is the only tier that
exercises:

- F0 classifier behaviour as a fresh user would experience it (no
  context bias from the parent).
- Skill auto-discovery from CLAUDE.md `@-import` resolution in a clean
  install.
- End-to-end firewall enforcement against a real LLM-driven Bash tool
  call.

## Cost

Each scenario is one or two `claude --print` invocations. The runner
defaults to **Haiku 4.5** (`claude-haiku-4-5-20251001`) to keep cost
trivial (~$0.01 / scenario, ~$0.10 for the whole suite). Override
with `PRAXIS_TIER4_MODEL=claude-sonnet-4-6` for higher fidelity at
~10× the spend.

Tier 4 is **opt-in**. It is NOT in `npm test` or CI; run via
`npm run test:tier4` or `./tests/scenarios/tier4/run.sh` directly.

## How the runner works

`run.sh` accepts a scenario name. For each scenario:

1. Create a fresh `HOME` via `mktemp -d`.
2. Pre-populate `$HOME/.claude/` with an empty CLAUDE.md and
   `{}` settings.json.
3. Run `praxis install` in that HOME.
4. Run `claude --print --model "$PRAXIS_TIER4_MODEL" -p "<prompt>"`
   with `HOME=$sandbox`. Capture stdout + exit code.
5. Run the scenario's assertion script against the captured output.
6. Emit `PASS` / `FAIL` / `SKIPPED`.
7. Clean the sandbox.

## Scenarios

See `tests/scenarios/tier4/TR*-*.md` for specs and
`tests/scenarios/tier4/results/<date>.md` for past runs.

## Known limitations

- Non-determinism: LLM output varies between runs. Assertions are
  substring-based, not exact-match.
- Cost: every run consumes API credits. Use Haiku unless you need
  classifier fidelity.
- Skill discovery latency: the first invocation in a fresh HOME
  resolves all `@-imports`, which takes seconds. Subsequent
  invocations in the same HOME are warmer.
- Some scenarios depend on the AST hook intercepting real Bash tool
  calls. Claude Code may not generate a Bash call for every prompt;
  these scenarios use prompts crafted to make Bash use very likely.
