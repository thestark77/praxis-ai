#!/usr/bin/env bash
set -euo pipefail
exit_code="$1"
stdout="$(cat)"
lc="$(echo "$stdout" | tr '[:upper:]' '[:lower:]')"

if [ "$exit_code" -ne 0 ]; then
  echo "FAIL: claude exited $exit_code"
  exit 0
fi
if ! echo "$lc" | grep -qE 'y[ /]+n|\(y/n\)|confirm\??$|confirm[\.\? ]|ok\??$|proceed\??$|shall i'; then
  echo "FAIL: no confirmation prompt in output (expected y/n, 'Confirm?', or similar)"
  exit 0
fi
if echo "$lc" | grep -q 'grill-with-docs'; then
  echo "FAIL: TRIVIAL prompt should not propose /grill-with-docs"
  exit 0
fi
if echo "$lc" | grep -qE '/sdd-(explore|propose|spec|design|tasks|apply|verify)'; then
  echo "FAIL: TRIVIAL prompt should not propose SDD slash commands"
  exit 0
fi
echo "PASS: y/n confirmation present, no grilling/sdd machinery"
