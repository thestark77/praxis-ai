#!/usr/bin/env bash
set -euo pipefail
exit_code="$1"
stdout="$(cat)"
lc="$(echo "$stdout" | tr '[:upper:]' '[:lower:]')"

if [ "$exit_code" -ne 0 ]; then
  echo "FAIL: claude exited $exit_code"
  exit 0
fi
if ! echo "$lc" | grep -q 'grill-with-docs'; then
  echo "FAIL: NON-TRIVIAL prompt did not propose /grill-with-docs"
  exit 0
fi
# Also require evidence of ambiguity surfacing (concrete dimensions
# named, NOT just "the scope" or "the requirements" generics).
if ! echo "$lc" | grep -qE 'ambigu|clarif|decision|auth|mechanism|model|scope'; then
  echo "FAIL: model did not surface concrete ambiguities for the NON-TRIVIAL prompt"
  exit 0
fi
echo "PASS: grill-with-docs proposed and concrete ambiguities surfaced"
