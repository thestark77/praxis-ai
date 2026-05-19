#!/usr/bin/env bash
# Tier 4 runner: spawn `claude --print` in a fresh sandbox HOME with a
# praxis-installed overlay, capture the response, run scenario assertions.
#
# Usage:
#   ./tests/scenarios/tier4/run.sh                 # run all TR* scenarios
#   ./tests/scenarios/tier4/run.sh TR1             # run a single scenario
#
# Env vars:
#   PRAXIS_TIER4_MODEL   default claude-haiku-4-5-20251001
#   PRAXIS_TIER4_TIMEOUT default 90 seconds per claude --print invocation
#
# Each scenario lives in tests/scenarios/tier4/<id>-*.md and has an
# adjacent <id>-assert.sh that receives the captured stdout on stdin
# plus the captured exit code as $1 and writes either:
#   PASS: <evidence>
#   FAIL: <reason>
# to stdout. The runner aggregates results.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PRAXIS_BIN="${PRAXIS_BIN:-praxis}"
MODEL="${PRAXIS_TIER4_MODEL:-claude-haiku-4-5-20251001}"
TIMEOUT="${PRAXIS_TIER4_TIMEOUT:-90}"
REAL_HOME="$HOME"

if ! command -v claude >/dev/null 2>&1; then
  echo "error: claude CLI not on PATH; Tier 4 requires Claude Code installed locally" >&2
  exit 2
fi

if ! command -v "$PRAXIS_BIN" >/dev/null 2>&1; then
  echo "error: praxis CLI not on PATH; install praxis-ai globally via npm install -g praxis-ai" >&2
  exit 2
fi

readarray -t SCENARIOS < <(find "$SCRIPT_DIR" -maxdepth 1 -name 'TR*-*.md' -print | sort)

if [ "${1:-}" != "" ]; then
  filter="$1"
  matched=()
  for spec in "${SCENARIOS[@]}"; do
    base=$(basename "$spec")
    if [[ "$base" == "$filter"* ]]; then
      matched+=("$spec")
    fi
  done
  SCENARIOS=("${matched[@]}")
fi

if [ ${#SCENARIOS[@]} -eq 0 ]; then
  echo "no scenarios matched"
  exit 1
fi

PASS_COUNT=0
FAIL_COUNT=0
RESULTS=()

echo "Tier 4 runner"
echo "  model:   $MODEL"
echo "  praxis:  $($PRAXIS_BIN --version)"
echo "  claude:  $(claude --version 2>&1 | head -1)"
echo "  count:   ${#SCENARIOS[@]} scenario(s)"
echo ""

for spec in "${SCENARIOS[@]}"; do
  id="$(basename "$spec" | cut -d- -f1)"
  prompt_file="${spec%.md}.prompt.txt"
  assert_script="${spec%.md}-assert.sh"

  if [ ! -f "$prompt_file" ] || [ ! -f "$assert_script" ]; then
    echo "$id  SKIP   (missing $prompt_file or $assert_script)"
    continue
  fi

  PROMPT="$(cat "$prompt_file")"
  SANDBOX="$(mktemp -d -t "praxis-tier4-${id}-XXXXXX")"
  mkdir -p "$SANDBOX/.claude"
  : > "$SANDBOX/.claude/CLAUDE.md"
  echo '{}' > "$SANDBOX/.claude/settings.json"

  # Seed Claude Code auth into the sandbox. Without this the
  # subprocess sees "Not logged in" because OAuth state lives under
  # the real HOME. Copy only auth state, nothing else.
  if [ -f "$REAL_HOME/.claude/.credentials.json" ]; then
    cp "$REAL_HOME/.claude/.credentials.json" "$SANDBOX/.claude/.credentials.json"
  fi
  if [ -f "$REAL_HOME/.claude.json" ]; then
    cp "$REAL_HOME/.claude.json" "$SANDBOX/.claude.json"
  fi

  HOME="$SANDBOX" "$PRAXIS_BIN" install >/dev/null 2>&1 || true

  STDOUT="$(mktemp)"
  STDERR="$(mktemp)"
  exit_code=0
  if ! timeout "$TIMEOUT" env HOME="$SANDBOX" claude --print --model "$MODEL" -p "$PROMPT" \
        >"$STDOUT" 2>"$STDERR"; then
    exit_code=$?
  fi

  # Run scenario-specific assertion.
  verdict="$(bash "$assert_script" "$exit_code" < "$STDOUT" 2>&1 || echo "FAIL: assertion script errored")"

  if [[ "$verdict" == PASS:* ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "$id  PASS   ${verdict#PASS: }"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "$id  FAIL   ${verdict#FAIL: }"
    echo "       stdout (first 600 chars):"
    head -c 600 "$STDOUT" | sed 's/^/         /'
  fi

  RESULTS+=("$id|$verdict")
  rm -rf "$SANDBOX" "$STDOUT" "$STDERR"
done

echo ""
echo "Summary: $PASS_COUNT PASS / $FAIL_COUNT FAIL out of ${#SCENARIOS[@]}"
[ "$FAIL_COUNT" -eq 0 ] || exit 1
