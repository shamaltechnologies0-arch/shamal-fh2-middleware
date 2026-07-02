# Shamal FH2 Viewer API Matrix

Shamal-controlled middleware between **DJI FlightHub 2** and **external viewer integrators** (CAFM platforms, dashboards, etc.).

> **Note:** Marafiq is an example external viewer user/company. The same API model applies to any future viewer Shamal onboards.

## How external viewers get API keys and values

Each external viewer receives **one connection package from Shamal**. They never get DJI login or FlightHub keys.

| What viewers get from Shamal | Example | Used for |
|------------------------------|---------|----------|
| **Base URL** | `https://api.shamal.com` | All API calls |
| **API key** | `viewer-ro-26` | Header `X-Api-Key` on every `/v1/marafiq/*` call (legacy path; `/v1/viewer/*` coming in a later phase) |
| **Swagger / OpenAPI** | `/docs`, `/openapi.yaml` | Developers build integrations |
| **IDs in responses** | `serialNumber`, task `id` | Copy from list APIs into detail APIs |

**Shamal keeps secret (never send to external viewers):**

| Shamal only | In `.env` |
|-------------|-----------|
| DJI OpenAPI JWT | `FH2_ORG_TOKEN` |
| FlightHub project | `FH2_PROJECT_UUID` |
| Webhook secret | `WEBHOOK_SECRET` |

**Flow:**

```text
External viewer platform  --X-Api-Key-->  Shamal FH2 Viewer Middleware  --FH2_ORG_TOKEN-->  DJI FlightHub 2
```

Viewer developers:

1. Call `GET /v1/marafiq/devices` → copy `serialNumber`
2. Call `GET /v1/marafiq/tasks` → copy `data[].id` (when tasks exist)
3. Poll telemetry/events on a schedule in their platform

---

## Full API list — status for external viewer integration

Legend:

- **Live** = available now via Shamal middleware (read-only)
- **Partial** = partly covered by existing endpoints
- **Phase 2** = Shamal middleware extension (implemented)
- **DJI direct** = Shamal backend only; not exposed to external viewers
- **N/A read-only** = command/stream APIs; not suitable for read-only viewer access

| DJI / industry API name | Viewer platform use | Shamal middleware today | Shamal endpoint (if any) |
|-------------------------|---------------------|-------------------------|--------------------------|
| **Device Management API** | Fleet list | **Live** | `GET /v1/marafiq/devices` |
| **Fleet Management API** | Same as above | **Live** | `GET /v1/marafiq/devices` |
| **Dock Management API** | Dock status | **Partial** | Dock in `devices`; detail via `GET /v1/marafiq/devices/{sn}` |
| **Device Health API** | Alerts / HMS | **Partial** | `GET /v1/marafiq/devices/{sn}` → `health` |
| **Device Status API** | Online/offline | **Live** | `devices` → `online`; detail in `devices/{sn}` |
| **Aircraft Telemetry API** | Map, battery | **Partial** | `GET /v1/marafiq/devices/{sn}/telemetry/latest` |
| **Live Flight Status API** | Mission state | **Partial** | `GET /v1/marafiq/tasks`, `tasks/{id}` |
| **MQTT Real-Time Data API** | Live stream | **Phase 2** | `GET /v1/marafiq/devices/{sn}/telemetry/stream` (SSE) |
| **Live Video Streaming API** | Live view | **Phase 2** | `GET /v1/marafiq/devices/{sn}/live-stream` |
| **RTMP/WebRTC Stream API** | Video player | **Phase 2** | Same as live-stream |
| **Flight Mission API** | Inspection jobs | **Live** | `GET /v1/marafiq/tasks` |
| **Flight Task API** | Same | **Live** | `GET /v1/marafiq/tasks`, `tasks/{id}` |
| **Waypoint Mission API** | Route metadata | **Partial** | Task detail / trajectory |
| **Mission Execution API** | Progress | **Partial** | `tasks/{id}` → status, waypoint progress |
| **Flight Record API** | History | **Live** | `GET /v1/marafiq/tasks` |
| **Media File API** | Evidence | **Live** | `GET /v1/marafiq/tasks/{id}/media` |
| **Photo & Video Retrieval API** | Attachments | **Live** | `tasks/{id}/media` → `downloadUrl`, `previewUrl` |
| **Cloud Mapping API** | Maps / ortho | **Phase 2** | `GET /v1/marafiq/mapping/models` |
| **2D/3D Reconstruction API** | Digital twin | **Phase 2** | `GET /v1/marafiq/mapping/models/{id}` |
| **Map/GIS Data API** | Layers on map | **Phase 2** | Mapping models + trajectory exports |
| **GeoJSON/KML API** | GIS import | **Live** | `GET /v1/marafiq/tasks/{id}/trajectory.geojson` / `.kml` |
| **Event Notification API** | Alerts | **Live** | `GET /v1/marafiq/events` |
| **Webhook Push API** | Real-time push | **Live** | FH2 → Shamal webhook; optional `VIEWER_EVENT_CALLBACK_URL` |
| **Remote Control Command API** | Fly drone | **N/A read-only** | Shamal operators only |
| **Camera/Gimbal Control API** | Control camera | **N/A read-only** | Shamal operators only |
| **Payload Control API** | Payload | **N/A read-only** | Shamal operators only |
| **Firmware Upgrade API** | OTA | **DJI direct** | Shamal ops only |
| **User & Organization Management API** | Accounts | **DJI direct** | Shamal admin only |
| **Workspace Management API** | Projects | **DJI direct** | Shamal sets `FH2_PROJECT_UUID` |
| **Storage/File Management API** | Files | **Partial** | Via `tasks/{id}/media` |
| **Data Synchronization API** | Bulk sync | **Partial** | Viewers poll REST endpoints |

---

## What external viewers will mostly use

| Viewer need | Shamal provides | How |
|-------------|-----------------|-----|
| **Telemetry API** | Latest position/battery snapshot | `GET /v1/marafiq/devices/{sn}/telemetry/latest` |
| **Live Video API** | Live capacity | `GET /v1/marafiq/devices/{sn}/live-stream` |
| **Mission API** | Flight / inspection tasks | `GET /v1/marafiq/tasks`, `tasks/{id}` |
| **Media API** | Photos/videos per task | `GET /v1/marafiq/tasks/{id}/media` |
| **Event/Webhook API** | Alerts | `GET /v1/marafiq/events` + optional callback URL |
| **GIS/Mapping API** | Ortho + paths | `mapping/models`, `trajectory.geojson` |
| **Device Status API** | Fleet online + detail | `GET /v1/marafiq/devices`, `fleet/summary` |
| **Dock API** | Dock status | `GET /v1/marafiq/docks`, `docks/{sn}` |

---

## Copy-paste: viewer connection sheet

```text
Base URL:     https://YOUR-SHAMAL-SERVER.com
Docs:         https://YOUR-SHAMAL-SERVER.com/docs
OpenAPI:      https://YOUR-SHAMAL-SERVER.com/openapi.yaml

Auth header:  X-Api-Key
API key:      viewer-ro-26          ← Shamal issues per viewer; change per client

Read APIs (legacy paths — still supported):
  GET /health
  GET /v1/marafiq/devices
  GET /v1/marafiq/devices/{serialNumber}
  GET /v1/marafiq/devices/{serialNumber}/telemetry/latest
  GET /v1/marafiq/tasks
  GET /v1/marafiq/tasks/{taskId}
  GET /v1/marafiq/tasks/{taskId}/media
  GET /v1/marafiq/tasks/{taskId}/trajectory
  GET /v1/marafiq/events

Where to get IDs:
  serialNumber  → from GET /v1/marafiq/devices → data[].serialNumber
  taskId        → from GET /v1/marafiq/tasks → data[].id

DJI credentials: NOT provided to external viewers.
```

---

## Phase 1 vs Phase 2

**Phase 1 (built now):** Read-only REST for fleet, telemetry snapshot, tasks, media, trajectory, events.

**Phase 2 (implemented):** Fleet summary, docks, live-stream info, SSE telemetry, mapping models, GeoJSON/KML, optional event callback to viewer platforms.

Commands (takeoff, gimbal, firmware) stay **Shamal operations only**, not external viewer platforms.

---

## Route migration (planned)

`/v1/marafiq/*` paths remain supported as **legacy aliases**. Canonical `/v1/viewer/*` paths will be added in a later implementation phase. See [PRD.md](../PRD.md).
