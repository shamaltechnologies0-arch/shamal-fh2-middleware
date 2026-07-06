# Read-only auto-test monitor

Automated checks for **read-only** external viewer API endpoints and Shamal Platform UI. No flight commands are sent.

## Quick start

```bash
# Terminal 1 — keep server running
npm run dev

# Terminal 2 — single run
KEY=viewer-ro-26 npm run test:readonly

# Terminal 2 — 2-hour monitor (every 10 minutes)
KEY=viewer-ro-26 npm run test:readonly:monitor

# After monitoring — regenerate report
npm run test:readonly:report
```

## Output

Results are written under:

```text
test-results/session-<timestamp>/
  run-*.json          # each API run (full detail)
  runs.jsonl          # append-only log
  browser-checks.jsonl
  monitor.log
  READONLY_TEST_REPORT.md   # human summary
```

## What is tested (read-only)

| Area | Endpoints |
|------|-----------|
| Meta | `/health`, `/v1/viewer/capabilities`, `/openapi.yaml` |
| Fleet | `/devices`, `/fleet/summary`, `/docks` |
| Device | `/devices/{sn}`, `/telemetry/latest`, `/live-stream`, `/ops/readiness` |
| Tasks | `/tasks`, `/tasks/{id}`, media, trajectory, GeoJSON, KML |
| Mapping | `/mapping/models` |
| Events | `/v1/viewer/events` |
| Ops (GET only) | `/ops/catalog`, `/ops/log` |

**Not tested:** POST operation commands (takeoff, land, etc.).

## Browser tabs (manual + recorded)

During monitoring, open:

1. **FlightHub 2** — https://fh.dji.com (ops team login; verify devices when powered on)
2. **Swagger** — http://localhost:8080/docs
3. **Shamal Platform** — http://localhost:8080/ (viewer: `external-integrator1`)

Record browser checks:

```bash
OUT_DIR=test-results/session-<id> npx tsx scripts/record-browser-check.ts "<url>" ok "note"
```

## Interpreting failures while devices are off

When dock/drone are **offline**, these often fail with `FH2 HTTP 403` until hardware is online:

- Device detail, telemetry, live-stream, dock detail
- Task list (device-scoped FH2 call)

These should still pass:

- Health, capabilities, fleet list, devices list, docks list, events, ops catalog, mapping list

When ops turns devices on, re-run or wait for the next monitor cycle — online count and telemetry should flip to **pass**.

## Stop monitor

```bash
# Find and kill the monitor process
pkill -f auto-test-monitor.sh
```
