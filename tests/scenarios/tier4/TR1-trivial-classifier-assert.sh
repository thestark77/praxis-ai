#!/usr/bin/env bash
set -euo pipefail
exit_code="$1"
stdout="$(cat)"
lc="$(echo "$stdout" | tr '[:upper:]' '[:lower:]')"

if [ "$exit_code" -ne 0 ]; then
  echo "FAIL: claude exited $exit_code"
  exit 0
fi
# Accept either:
#   (a) a confirmation prompt — y/n, "Confirm?", "Shall I", etc. (the
#       happy path when the file exists)
#   (b) a permission/approval request — "I need permission", "approve",
#       "once you authorise" (the equally-praxis-correct response when
#       the model needs to read a file that doesn't exist yet)
# Both are TRIVIAL behaviour: terse, scoped, not premature coding.
if ! echo "$lc" | grep -qE 'y[ /]+n|\(y/n\)|confirm\??$|confirm[\.\? ]|ok\??$|proceed\??$|shall i|permission|approve|authoriz|authoris'; then
  echo "FAIL: no confirmation prompt or permission request in output"
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
