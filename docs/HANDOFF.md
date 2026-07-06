# Handoff package — external viewer integrators

Shamal owns the drones and DJI FlightHub 2 account. External viewer platforms consume **approved Shamal operational records** via this middleware (read-only). Example viewer: external CAFM client.

The `/v1/viewer/*` routes are **legacy aliases** from an early integrator demo. They remain supported during migration; canonical `/v1/viewer/*` paths are planned in a later phase (see [PRD.md](../PRD.md)).

## Deliverables

| Item | Location |
|------|----------|
| REST API (running) | `docker compose up` → port 8080 |
| OpenAPI spec | `/openapi.yaml` or `openapi/shamal-platform-v1.yaml` |
| Swagger UI | `http://localhost:8080/docs` |
| Postman collection | `postman/Shamal-FH2-Viewer-Middleware.postman_collection.json` |
| FH2 credential setup | `docs/FH2_SETUP.md` |
| Security brief | `docs/CYBERSECURITY.md` |
| Demo script | `docs/DEMO_SCRIPT.md` |
| Viewer API matrix | `docs/VIEWER_API_MATRIX.md` |
| Viewer handoff sheet | `docs/VIEWER_SUBMIT.md` |

## Viewer-facing endpoints (legacy paths)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/viewer/devices` | Fleet list |
| GET | `/v1/viewer/devices/{sn}` | Device + HMS |
| GET | `/v1/viewer/devices/{sn}/telemetry/latest` | Position/battery snapshot |
| GET | `/v1/viewer/tasks` | Inspection jobs |
| GET | `/v1/viewer/tasks/{id}` | Task detail |
| GET | `/v1/viewer/tasks/{id}/media` | Photos/videos |
| GET | `/v1/viewer/tasks/{id}/trajectory` | Flight path |
| GET | `/v1/viewer/events` | Alert feed |

### Phase 2 (added)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/viewer/capabilities` | Feature list |
| GET | `/v1/viewer/fleet/summary` | Fleet dashboard |
| GET | `/v1/viewer/docks` | Dock list |
| GET | `/v1/viewer/docks/{sn}` | Dock detail |
| GET | `/v1/viewer/devices/{sn}/live-stream` | Live video info |
| GET | `/v1/viewer/devices/{sn}/telemetry/stream` | SSE telemetry |
| GET | `/v1/viewer/mapping/models` | Mapping jobs |
| GET | `/v1/viewer/mapping/models/{id}` | Model detail |
| GET | `/v1/viewer/tasks/{id}/trajectory.geojson` | GeoJSON path |
| GET | `/v1/viewer/tasks/{id}/trajectory.kml` | KML path |

See [PHASE2.md](PHASE2.md).

Auth header: `X-Api-Key: <issued-by-shamal>`

## FlightHub 2 APIs wrapped (internal — Shamal only)

- Organization & Project
- Device Management / State / HMS
- Task Management (list, detail, media, trajectory)
- Webhook ingestion

## Go-live checklist

- [ ] FlightHub Sync enabled; `FH2_MODE=live`
- [ ] Production TLS + domain
- [ ] Viewer API keys issued (`VIEWER_API_KEYS`)
- [ ] IP allowlist if required (`VIEWER_IP_ALLOWLIST`)
- [ ] FH2 webhooks → `https://<shamal-host>/webhooks/fh2`
- [ ] External viewer technical contact for integration testing

## Support

Shamal Technologies — authorized DJI dealer. Integration questions: Shamal engineering lead.
