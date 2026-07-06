# Shamal FH2 Viewer — External integration handoff

**From:** Shamal Technologies  
**To:** External viewer integration team  
**Phase:** 1 — read-only viewer access

## Who owns what

| Party | Role |
|-------|------|
| **Shamal** | Owns drones, docks, and DJI FlightHub 2 account. Operates flights and inspections. |
| **DJI FlightHub 2** | Source system for fleet, missions, media, and alerts. |
| **Shamal FH2 Viewer Middleware** | Reads Shamal’s FlightHub 2 data and exposes a restricted REST API. |
| **External viewer platform** | Displays **approved Shamal operational records** (read-only). Example: external CAFM client. |

External viewers connect to **Shamal’s platform only**. They never receive DJI FH2 login, credentials, or dashboard access.

The `/v1/viewer/*` paths are **legacy route aliases** (named during an early integrator demo). They do not mean viewer-owned devices.

---

## 1) Connection values (give to external viewer)

```
API Name:        Shamal FH2 External Viewer Middleware

Data owner:      Shamal Technologies (drones & docks operated via DJI FlightHub 2)
Data shown:      Shamal fleet, flight tasks, inspection media, telemetry, events

Base URL:        http://localhost:8080
                 (Production: replace with https://YOUR-SHAMAL-SERVER.com)

Swagger UI:      http://localhost:8080/docs
OpenAPI file:    http://localhost:8080/openapi.yaml

API Key:         demo-viewer-key-change-me
Auth header:     X-Api-Key
Auth value:      demo-viewer-key-change-me

Example Shamal drone SN:  1581F8HGX254W00A0CHR   (Matrice 4TD)
Example Shamal dock SN:   8UUXN6300A09XS         (DJI Dock 3)
FlightHub project:        Shamal project (FH2_PROJECT_UUID)
```

> **Note for Shamal:** Before sending to an external viewer, change the API key in `.env` (`VIEWER_API_KEYS`) and update the key above. Never send DJI / FlightHub keys to external viewers.

---

## 2) Email text (copy & paste — customize recipient name)

```
Subject: Shamal Drone Operations API — viewer access to FlightHub records

Dear [Viewer integration team],

Shamal Technologies operates our drone fleet using DJI FlightHub 2. We are
providing a read-only API so your platform can display our approved operational
records (fleet status, inspections, media, telemetry, and alerts) — without
your team needing DJI accounts or credentials.

Ownership:
  • Drones, docks, and FlightHub data: Shamal Technologies
  • Viewer platform display / integration: [Your company]
  • DJI FlightHub login & API keys: Shamal only (not shared)

Connection:
  Base URL:      http://localhost:8080
                 (Production HTTPS URL will be shared before go-live.)
  Documentation: http://localhost:8080/docs
  OpenAPI spec:  http://localhost:8080/openapi.yaml

Authentication:
  Header:  X-Api-Key
  Value:   demo-viewer-key-change-me

Endpoints (GET, read-only — Shamal FlightHub data):
  /health
  /v1/viewer/devices                              → Shamal fleet list
  /v1/viewer/devices/{serialNumber}               → Shamal device detail
  /v1/viewer/devices/{serialNumber}/telemetry/latest
  /v1/viewer/tasks                                → Shamal flight / inspection jobs
  /v1/viewer/tasks/{taskId}
  /v1/viewer/tasks/{taskId}/media
  /v1/viewer/tasks/{taskId}/trajectory
  /v1/viewer/events                               → Shamal alerts / events

Attached: OpenAPI YAML, Postman collection.

Regards,
Shamal Technologies
Authorized DJI dealer — FlightHub 2 operations
```

---

## 3) All API URLs (copy one line = one API)

Replace `{BASE}` with `http://localhost:8080`  
Replace `{KEY}` with `demo-viewer-key-change-me`  
Replace `{SN}` with a device serial (e.g. `1581F8HGX254W00A0CHR`)  
Replace `{TASK}` with a task UUID from `/v1/viewer/tasks`

| # | API | Full URL |
|---|-----|----------|
| 1 | Health | `http://localhost:8080/health` |
| 2 | Shamal fleet list | `http://localhost:8080/v1/viewer/devices` |
| 3 | Shamal device detail | `http://localhost:8080/v1/viewer/devices/1581F8HGX254W00A0CHR` |
| 4 | Shamal drone telemetry | `http://localhost:8080/v1/viewer/devices/1581F8HGX254W00A0CHR/telemetry/latest` |
| 5 | Shamal flight / inspection tasks | `http://localhost:8080/v1/viewer/tasks` |
| 6 | Task detail | `http://localhost:8080/v1/viewer/tasks/{TASK}` |
| 7 | Task media | `http://localhost:8080/v1/viewer/tasks/{TASK}/media` |
| 8 | Task trajectory | `http://localhost:8080/v1/viewer/tasks/{TASK}/trajectory` |
| 9 | Events / alerts | `http://localhost:8080/v1/viewer/events` |

**Header for rows 2–9:**

```
X-Api-Key: demo-viewer-key-change-me
```

---

## 4) cURL commands (copy & paste in Terminal)

```bash
BASE="http://localhost:8080"
KEY="demo-viewer-key-change-me"
SN="1581F8HGX254W00A0CHR"
```

### Health (no key)

```bash
curl -s "$BASE/health"
```

### Devices

```bash
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/devices"
```

```bash
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/devices/$SN"
```

```bash
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/devices/$SN/telemetry/latest"
```

### Tasks (use task id from tasks list when available)

```bash
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/tasks"
```

```bash
TASK="PASTE-TASK-UUID-HERE"
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/tasks/$TASK"
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/tasks/$TASK/media"
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/tasks/$TASK/trajectory"
```

### Events

```bash
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/viewer/events"
```

---

## 5) Swagger (for viewer developers)

1. Open: http://localhost:8080/docs  
2. Click **Authorize**  
3. In **Value**, paste exactly:

```
demo-viewer-key-change-me
```

4. Click **Authorize** → **Close**  
5. Open any `GET /v1/viewer/...` → **Try it out** → **Execute**

---

## 6) Files to attach when emailing external viewers

| File | Path in repo |
|------|----------------|
| OpenAPI spec | `openapi/shamal-external-integrator-v1.yaml` |
| Postman | `postman/Shamal-FH2-Viewer-Middleware.postman_collection.json` |
| Security brief | `docs/CYBERSECURITY.md` |
| This sheet | `docs/VIEWER_SUBMIT.md` |

---

## 7) Do NOT send to external viewers

- DJI OpenAPI key (`FH2_ORG_TOKEN`)
- FlightHub project UUID (`FH2_PROJECT_UUID`)
- Organization admin credentials
- Webhook secret (`WEBHOOK_SECRET`)

---

## Example viewer: external viewer

external CAFM client was the first external viewer integration demo. The connection model above applies equally to external viewer and any future viewer company Shamal onboards.
