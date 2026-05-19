#!/usr/bin/env bash
# Benchmark the praxis-ast-hook on the current platform.
# Reports cold-allow, warm-allow, deny-with-telemetry, and
# deny-without-telemetry latencies averaged over N invocations.
#
# Used by CI (ci.yml runs this on ubuntu-latest and macos-latest)
# and locally by anyone curious. Numbers are written to stdout in a
# machine-readable + human-readable format.
#
# Requires:
#   - The praxis-ai package built locally (dist/ast-hook.js present)
#   - Node 18+
#
# Usage:
#   ./scripts/bench-hook.sh [N]            # default N=50

set -euo pipefail

N="${1:-50}"
HOOK_BIN="${PRAXIS_AST_HOOK_BIN:-$(dirname "$0")/../bin/praxis-ast-hook.js}"

if [ ! -f "$HOOK_BIN" ]; then
  echo "error: hook binary not found at $HOOK_BIN" >&2
  echo "       set PRAXIS_AST_HOOK_BIN or run from a repo with bin/ built" >&2
  exit 1
fi

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

SAFE='{"tool_name":"Bash","tool_input":{"command":"echo hello"}}'
DENY='{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/praxis-bench-target"}}'

time_n() {
  local label="$1"; shift
  local payload="$1"; shift
  local home="$1"; shift
  local n="$1"; shift
  local telemetry_disabled="${1:-0}"

  local start_ms end_ms total_ms per_ms
  start_ms=$(date +%s%N)
  for _ in $(seq 1 "$n"); do
    if [ "$telemetry_disabled" = "1" ]; then
      env HOME="$home" PRAXIS_TELEMETRY_DISABLED=1 node "$HOOK_BIN" <<< "$payload" >/dev/null 2>&1
    else
      env HOME="$home" node "$HOOK_BIN" <<< "$payload" >/dev/null 2>&1
    fi
  done
  end_ms=$(date +%s%N)
  total_ms=$(( (end_ms - start_ms) / 1000000 ))
  per_ms=$(awk -v t="$total_ms" -v n="$n" 'BEGIN { printf "%.2f", t/n }')

  echo "  $label: $n invocations, ${total_ms}ms total, ${per_ms}ms/invocation"
  # Machine-readable line for CI to pick up.
  echo "BENCH:$label:n=$n:total_ms=$total_ms:per_ms=$per_ms"
}

uname_s="$(uname -s)"
node_version="$(node --version)"
echo "praxis-ast-hook benchmark"
echo "  platform: $uname_s"
echo "  node:     $node_version"
echo "  n:        $N"
echo ""

echo "Cold (no telemetry DB, allow path):"
time_n cold-allow "$SAFE" "$SANDBOX" "$N"

# Force telemetry DB creation via a single deny in this HOME.
HOME="$SANDBOX" node "$HOOK_BIN" <<< "$DENY" >/dev/null 2>&1 || true

echo ""
echo "Warm (telemetry DB exists, allow path):"
time_n warm-allow "$SAFE" "$SANDBOX" "$N"

echo ""
echo "Warm (deny path, writes deny_hit row):"
time_n warm-deny "$DENY" "$SANDBOX" "$N"

echo ""
echo "Telemetry disabled (deny, no DB write):"
time_n no-telemetry-deny "$DENY" "$SANDBOX" "$N" 1
