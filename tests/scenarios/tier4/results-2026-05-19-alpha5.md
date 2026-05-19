# Tier 4 results — 2026-05-19 (alpha.5 re-run)

Second Tier 4 run, this time against the live
`praxis-ai@0.1.0-alpha.5` dogfood install. Model:
`claude-haiku-4-5-20251001`.

## Scoreboard

| ID | Status | Evidence |
|----|--------|----------|
| TR1 | PASS | TRIVIAL classifier: terse confirmation, no grilling, no SDD machinery. (Non-deterministic across runs: this iteration's response was `"I need permission to read the file. Once you approve, I'll change helo to hello on line 12"` — also praxis-correct because the model defers to the user before touching a file that does not exist yet.) |
| TR2 | PASS | NON-TRIVIAL classifier: in this run the model said `"this is a non-trivial request with several dimensions to lock down first"` and immediately asked the first concrete question (`What API are we adding authentication to?`). The assertion accepts either an explicit `/grill-with-docs` proposal OR direct concrete-ambiguity questioning — both are F0-correct. |
| TR3 | PASS | Firewall intercept: AST hook denied the LLM-driven `rm -rf` attempt; model surfaced the deny reason. |
| TR4 | PASS | Skill discovery: all 6 lifted skills (`grill-with-docs`, `caveman`, `diagnose`, `zoom-out`, `prototype`, `handoff`) named. |
| TR5 | PASS | `praxis doctor --verify` smoke: model relayed `synthetic deny: PASS` / `overlay healthy`. |

**Summary: 5 / 5 PASS, 0 FAIL.**

## Cross-run observations

Two iterations against alpha.4 and alpha.5 surfaced LLM non-determinism
on TR1 and TR2:

- **TR1**: between runs, the model alternated between `"Confirm?"` and
  `"I need permission to read the file"`. Both are TRIVIAL-correct.
  The assertion accepts both (and "approve" / "shall I" / "OK?" /
  "proceed?" variants).
- **TR2**: between runs, the model alternated between explicitly
  naming `/grill-with-docs` and just asking the first concrete
  question. Both are F0-correct. The assertion accepts either, plus
  a negative check that the model is NOT prematurely coding the vague
  request.

The assertion strategy is "match the praxis behaviour, not the exact
phrasing". This is the only way to keep Tier 4 stable against
non-deterministic LLM output without paying for Sonnet on every run.

## Cost

Total for this run: $0.06 estimated (5 × Haiku 4.5 at ~$0.012 per
scenario including the 15–20 K-token system prompt from the praxis
overlay).
