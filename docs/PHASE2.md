# Phase 2 — external CAFM client extensions

Phase 2 builds on Phase 1 (read-only fleet, tasks, media, events).

## New endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/viewer/capabilities` | Lists phase 1 + 2 features |
| `GET /v1/viewer/fleet/summary` | Dashboard counts (drones, docks, online) |
| `GET /v1/viewer/docks` | Dock list only |
| `GET /v1/viewer/docks/{sn}` | Dock detail + linked drone |
| `GET /v1/viewer/devices/{sn}/live-stream` | Live video capacity (RTMP/WebRTC readiness) |
| `GET /v1/viewer/devices/{sn}/telemetry/stream` | SSE telemetry (MQTT-style for CAFM) |
| `GET /v1/viewer/mapping/models` | 2D/3D reconstruction jobs |
| `GET /v1/viewer/mapping/models/{id}` | Model detail + download URL |
| `GET /v1/viewer/tasks/{id}/trajectory.geojson` | GIS import |
| `GET /v1/viewer/tasks/{id}/trajectory.kml` | GIS import |

## external viewer event push (optional)

When FlightHub sends webhooks to Shamal, Shamal can **forward** events to external viewer:

```env
VIEWER_EVENT_CALLBACK_URL=https://external-integrator-cafm.example.com/api/shamal/events
VIEWER_EVENT_CALLBACK_SECRET=shared-secret
```

Flow:

```text
FlightHub 2  →  POST /webhooks/fh2  →  Shamal  →  POST external viewer callback URL
```

external viewer can still poll `GET /v1/viewer/events` if they prefer pull mode.

## Not included (Shamal operations only)

- Remote control (takeoff, gimbal, payload)
- Firmware upgrade commands
- Direct MQTT broker access for external viewer

## Restart after update

```bash
npm run dev
```

Open Swagger: http://localhost:8080/docs
