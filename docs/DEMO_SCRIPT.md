# 5–7 minute demo script (external viewer)

**Prerequisites:** Middleware running (`docker compose up` or `npm run dev`). API key: value from `VIEWER_API_KEYS` (or legacy `VIEWER_API_KEYS`).

```bash
export BASE=http://localhost:8080
export KEY=demo-viewer-key-change-me
```

## 1. Health (30s)

```bash
curl -s "$BASE/health" | jq .
```

Point out: `fh2Mode: mock` until FlightHub Sync org key is configured.

## 2. Fleet (1 min)

```bash
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/devices" | jq .
```

Show normalized drones/docks for external viewer asset linking.

## 3. Device + telemetry (1 min)

```bash
SN=1581F6QAD23B00TEST01
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/devices/$SN" | jq .
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/devices/$SN/telemetry/latest" | jq .
```

Explain: snapshot polling every 10–15s in viewer platforms; live stream available when enabled by Shamal.

## 4. Inspection tasks (2 min)

```bash
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/tasks" | jq .
TASK=0bbc74b4-5e5a-4390-9256-8e4ee08a241b
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/tasks/$TASK" | jq .
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/tasks/$TASK/media" | jq .
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/tasks/$TASK/trajectory" | jq .
```

## 5. Events / alerts (1 min)

```bash
npm run seed:demo-event
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/events" | jq .
```

## 6. Swagger (30s)

Open `http://localhost:8080/docs` — API contract for external viewer developers.

## Talking points

- Shamal normalizes FlightHub 2; external viewers never hold DJI keys.
- Phase 1: read-only operational data through Shamal’s platform.
- external viewer is one example viewer company; the same model applies to future viewers.
- Phase 2: fleet summary, docks, live stream, mapping (Shamal-built viewer surface, not direct FH2 access).
