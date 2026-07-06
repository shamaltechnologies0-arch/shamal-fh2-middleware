#!/usr/bin/env bash
# Long-running read-only test monitor for Shamal FH2 middleware.
# Usage: ./scripts/auto-test-monitor.sh [duration_hours] [interval_minutes]
set -euo pipefail

DURATION_HOURS="${1:-2}"
INTERVAL_MIN="${2:-10}"
BASE="${BASE:-http://localhost:8080}"
KEY="${KEY:-viewer-ro-26}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -n "${OUT_DIR:-}" ]]; then
  SESSION_ID="$(basename "$OUT_DIR")"
else
  SESSION_ID="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  OUT_DIR="$ROOT/test-results/session-$SESSION_ID"
fi
LOG="$OUT_DIR/monitor.log"

mkdir -p "$OUT_DIR"
echo "Session: $OUT_DIR" | tee "$LOG"
echo "Duration: ${DURATION_HOURS}h, interval: ${INTERVAL_MIN}m" | tee -a "$LOG"

END_EPOCH=$(( $(date +%s) + DURATION_HOURS * 3600 ))
RUN=0

while [[ $(date +%s) -lt $END_EPOCH ]]; do
  RUN=$((RUN + 1))
  LABEL="$(date -u +%Y-%m-%dT%H:%M:%SZ)-run${RUN}"
  echo "--- Run $RUN at $LABEL ---" | tee -a "$LOG"

  if ! curl -sf "$BASE/health" >/dev/null 2>&1; then
    echo "WARN: server not reachable at $BASE — skipping run $RUN" | tee -a "$LOG"
  else
    BASE="$BASE" KEY="$KEY" OUT_DIR="$OUT_DIR" RUN_LABEL="$LABEL" \
      npx tsx "$ROOT/scripts/auto-test-readonly.ts" "$OUT_DIR" 2>&1 | tee -a "$LOG" || true
  fi

  REMAIN=$(( END_EPOCH - $(date +%s) ))
  if [[ $REMAIN -le 0 ]]; then break; fi
  SLEEP_SEC=$(( INTERVAL_MIN * 60 ))
  if [[ $SLEEP_SEC -gt $REMAIN ]]; then SLEEP_SEC=$REMAIN; fi
  echo "Sleeping ${SLEEP_SEC}s ($(($REMAIN / 60))m remaining)..." | tee -a "$LOG"
  sleep "$SLEEP_SEC"
done

echo "Generating report..." | tee -a "$LOG"
npx tsx "$ROOT/scripts/generate-test-report.ts" "$OUT_DIR" 2>&1 | tee -a "$LOG"
echo "AGENT_LOOP_TICK_readonly_tests {\"prompt\":\"Review test-results session $SESSION_ID and update READONLY_TEST_REPORT if devices came online\",\"outDir\":\"$OUT_DIR\"}" | tee -a "$LOG"
echo "Monitor complete. Report: $OUT_DIR/READONLY_TEST_REPORT.md" | tee -a "$LOG"
