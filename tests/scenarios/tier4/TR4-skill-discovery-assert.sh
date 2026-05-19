#!/usr/bin/env bash
set -euo pipefail
exit_code="$1"
stdout="$(cat)"
lc="$(echo "$stdout" | tr '[:upper:]' '[:lower:]')"

if [ "$exit_code" -ne 0 ]; then
  echo "FAIL: claude exited $exit_code"
  exit 0
fi

count=0
for name in grill-with-docs caveman diagnose zoom-out prototype handoff; do
  if echo "$lc" | grep -q "$name"; then
    count=$((count + 1))
  fi
done

if [ "$count" -ge 4 ]; then
  echo "PASS: $count of 6 lifted skill names present"
else
  echo "FAIL: only $count of 6 lifted skill names present"
fi
