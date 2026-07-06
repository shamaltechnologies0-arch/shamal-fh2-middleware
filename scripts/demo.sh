#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-http://localhost:8080}"
KEY="${KEY:-demo-viewer-key-change-me}"
HDR=(-H "X-Api-Key: $KEY")

echo "=== Health ==="
curl -s "$BASE/health" | jq .

echo "=== Devices ==="
curl -s "${HDR[@]}" "$BASE/v1/viewer/devices" | jq '.meta, (.data | length)'

SN="${SN:-1581F6QAD23B00TEST01}"
echo "=== Device $SN ==="
curl -s "${HDR[@]}" "$BASE/v1/viewer/devices/$SN" | jq '.data.device, .data.health'

echo "=== Telemetry ==="
curl -s "${HDR[@]}" "$BASE/v1/viewer/devices/$SN/telemetry/latest" | jq '.data | {latitude, longitude, batteryPercent}'

echo "=== Tasks ==="
curl -s "${HDR[@]}" "$BASE/v1/viewer/tasks" | jq '.meta, (.data | length)'

TASK="${TASK:-0bbc74b4-5e5a-4390-9256-8e4ee08a241b}"
echo "=== Task media $TASK ==="
curl -s "${HDR[@]}" "$BASE/v1/viewer/tasks/$TASK/media" | jq '.meta'

echo "=== Events ==="
curl -s "${HDR[@]}" "$BASE/v1/viewer/events" | jq '.meta'

echo "Done. Open $BASE/docs for Swagger UI."
