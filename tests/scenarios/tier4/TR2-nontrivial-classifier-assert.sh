#!/usr/bin/env bash
set -euo pipefail
exit_code="$1"
stdout="$(cat)"
lc="$(echo "$stdout" | tr '[:upper:]' '[:lower:]')"

if [ "$exit_code" -ne 0 ]; then
  echo "FAIL: claude exited $exit_code"
  exit 0
fi
# F0 NON-TRIVIAL behaviour can manifest in two ways:
#   (a) Explicit proposal of /grill-with-docs with the three-option
#       pattern (the canonical form per phase-flow.md).
#   (b) Direct ambiguity surfacing — first clarifying question asked
#       inline, no premature coding (Haiku's preferred shorter form).
# Both are praxis-correct: the point is to NOT start coding the
# vague request and to surface specifics first.

surfaces_ambiguity=0
if echo "$lc" | grep -qE 'ambigu|clarif|decision|non-trivial|several dimensions'; then
  surfaces_ambiguity=1
fi

proposes_grill=0
if echo "$lc" | grep -q 'grill-with-docs'; then
  proposes_grill=1
fi

asks_concrete_question=0
# Concrete dimensions named (not generic "the scope"): one of the
# axes the model would naturally raise for auth — mechanism, session,
# credential store, MFA, OAuth, JWT, scope-of-API, etc.
if echo "$lc" | grep -qE 'jwt|oauth|session|cookie|credentia|password|token|mfa|2fa|mechanism|which (api|service)'; then
  asks_concrete_question=1
fi

# Negative check: no premature coding.
if echo "$lc" | grep -qE 'I will (now |)(start|begin|implement|write the)'; then
  echo "FAIL: model started coding the vague request prematurely"
  exit 0
fi

if [ "$proposes_grill" -eq 1 ]; then
  echo "PASS: /grill-with-docs explicitly proposed"
elif [ "$surfaces_ambiguity" -eq 1 ] && [ "$asks_concrete_question" -eq 1 ]; then
  echo "PASS: ambiguity surfaced and a concrete dimension named (inline F0)"
else
  echo "FAIL: neither /grill-with-docs proposed nor concrete ambiguity surfaced (surfaces=$surfaces_ambiguity proposes=$proposes_grill concrete=$asks_concrete_question)"
fi
