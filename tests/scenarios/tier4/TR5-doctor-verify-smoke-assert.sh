#!/usr/bin/env bash
set -euo pipefail
exit_code="$1"
stdout="$(cat)"
lc="$(echo "$stdout" | tr '[:upper:]' '[:lower:]')"

if [ "$exit_code" -ne 0 ]; then
  echo "FAIL: claude exited $exit_code"
  exit 0
fi
if echo "$lc" | grep -qE 'synthetic deny:\s*pass|overlay healthy|ast hook verify'; then
  echo "PASS: doctor verify signal present in response"
  exit 0
fi
echo "FAIL: no doctor verify signal in response"
