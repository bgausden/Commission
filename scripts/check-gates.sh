#!/usr/bin/env bash
# Definition-of-done gate check
#
# Fires on the Stop hook event. Runs the three required gates:
#   1. npm test          — full test suite (no tests deleted/skipped/weakened)
#   2. regression        — BASELINE_NAME=2025-12 npm run test:regression
#   3. npm run build     — clean TypeScript build
#
# Blocks the agent from stopping if any gate fails.
# Respects stop_hook_active to prevent infinite loops.

set -uo pipefail

# ── Read hook input ──────────────────────────────────────────────────────────
INPUT=$(cat)

# ── Guard against infinite loops ─────────────────────────────────────────────
STOP_HOOK_ACTIVE=$(printf '%s' "$INPUT" | node -e "
let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try { console.log(JSON.parse(d).stop_hook_active ? 'true' : 'false'); }
  catch { console.log('false'); }
})" 2>/dev/null || echo "false")

if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  printf '{"systemMessage":"Definition-of-done gates skipped on second stop (stop_hook_active=true). Verify all three gates manually before pushing."}\n'
  exit 0
fi

# ── Run the three gates ──────────────────────────────────────────────────────
FAILURES=()

echo "=== Gate 1/3: npm test ===" 1>&2
if ! npm test 1>&2; then
  FAILURES+=("npm test")
fi

echo "=== Gate 2/3: regression (BASELINE_NAME=2025-12) ===" 1>&2
if ! BASELINE_NAME=2025-12 npm run test:regression 1>&2; then
  FAILURES+=("regression (BASELINE_NAME=2025-12)")
fi

echo "=== Gate 3/3: npm run build ===" 1>&2
if ! npm run build 1>&2; then
  FAILURES+=("npm run build")
fi

# ── Report result ────────────────────────────────────────────────────────────
if [ ${#FAILURES[@]} -gt 0 ]; then
  FAILURE_MSG=""
  for f in "${FAILURES[@]}"; do
    [ -n "$FAILURE_MSG" ] && FAILURE_MSG="$FAILURE_MSG; "
    FAILURE_MSG="$FAILURE_MSG$f"
  done

  GATE_FAILURES="$FAILURE_MSG" node -e "
const f = process.env.GATE_FAILURES;
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'Stop',
    decision: 'block',
    reason: 'Definition-of-done gates failed: ' + f + '. Fix all failures before finishing.'
  }
}));"
  exit 0
fi

printf '{"systemMessage":"All definition-of-done gates passed (tests, regression 2025-12, build)."}\n'
exit 0
