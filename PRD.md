# PRD — Product Positioning & Viewer Identity Correction

**Document type:** Iteration / change specification  
**Repository:** `shamal-fh2-middleware`  
**Status:** Draft for implementation  
**Date:** 2026-06-30

---

## 1. Executive summary

This is **not a new build**. This is a **correction iteration** over the existing Shamal FH2 middleware project.

The application already works: FH2 live/mock mode, device/task/media/telemetry APIs, event ingestion, admin login, viewer login, database persistence, and Docker/local dev workflow must **continue to work** after this iteration.

### Problem

The codebase, documentation, OpenAPI spec, environment variables, API paths, Postman collection, and UI labels currently present the product as **Marafiq-specific** (e.g. “Marafiq demo”, “Marafiq CAFM integration”, `/v1/marafiq/*` as the primary API namespace, `MARAFIQ_*` env vars). That misrepresents the product.

### Correct product meaning

| Role | Description |
|------|-------------|
| **Shamal** | Owns and operates DJI FlightHub 2. Controls dock, drone, missions, telemetry, media, live monitoring, and FH2 project setup. Holds all FH2 credentials and admin secrets. |
| **External viewer users** (e.g. Marafiq) | Third-party companies allowed by Shamal to see **approved** project data **only through Shamal’s platform**. Never receive direct DJI FH2 access. |
| **Marafiq** | One **example** external viewer user/company. Not the product identity. Future viewer companies use the same restricted access model. |

### Product names (use interchangeably in docs)

- **Shamal FH2 Client Viewer Platform**
- **Shamal FH2 External Viewer Middleware**

**One-line definition:** A Shamal-controlled middleware and viewer layer that reads approved data from Shamal’s DJI FlightHub 2 and exposes restricted viewer access to external viewer users.

---

## 2. Architecture

```
Shamal DJI FlightHub 2 Organization
        │
        ▼
Shamal FH2 Middleware / Viewer Platform   ← Shamal owns FH2 credentials (FH2_ORG_TOKEN, FH2_PROJECT_UUID)
        │
        ▼
Viewer User Access                        ← X-Api-Key / viewer session only; read-only by default
        │
        ▼
Marafiq or any future external viewer user/company
```

**Critical rule:** External users connect to **Shamal’s platform**. They do **not** connect directly to DJI FlightHub 2.

**Current codebase anchor points:**

| Layer | Location |
|-------|----------|
| FH2 adapters | `src/fh2/liveAdapter.ts`, `src/fh2/mockAdapter.ts`, `src/fh2/client.ts` |
| API routes | `src/routes/*.ts` (today: all under `/v1/marafiq/*`) |
| Auth & roles | `src/plugins/auth.ts`, `src/services/apiAccess.ts`, `src/services/commandCenterAuth.ts` |
| Viewer permissions | `src/services/viewerDashboardPermissions.ts`, `data/viewer-dashboard-permissions.json` |
| Platform UI | `src/ui/command-center.html` |
| OpenAPI | `openapi/shamal-marafiq-v1.yaml` |

---

## 3. Direct FH2 access rule

External viewer users must **never** receive:

- DJI FlightHub 2 login
- DJI FlightHub 2 dashboard access
- DJI FlightHub 2 credentials
- DJI FlightHub 2 organization access
- FH2 project admin access
- Drone control
- Dock control
- Mission control (start / stop / edit / delete)
- Camera / gimbal control
- Payload control
- Firmware / control operations
- Internal Shamal admin settings

**Shamal keeps full operational control.**

### Shamal-only secrets (must never appear in viewer responses, logs, or docs aimed at external users)

| Variable | Purpose |
|----------|---------|
| `FH2_ORG_TOKEN` | DJI organization API key |
| `FH2_PROJECT_UUID` | Shamal FH2 project scope |
| `WEBHOOK_SECRET` | FH2 webhook HMAC verification |
| `CC_SESSION_SECRET` | Shamal platform session signing |
| Admin / operator credentials | Shamal internal accounts |

---

## 4. Viewer user definition

### Who is a viewer user?

External users **allowed by Shamal** to see **approved** project data through Shamal’s platform only. Examples: Marafiq, or any future external company Shamal onboards.

### Viewer users CAN

| Capability | API / UI surface (after migration) |
|------------|-------------------------------------|
| Login to Shamal platform | `POST /v1/viewer/auth/login` (alias: `/v1/marafiq/auth/login`) |
| View assigned project dashboard | Command Center viewer role |
| View approved dock status | `GET /v1/viewer/docks`, `GET /v1/viewer/docks/{sn}` |
| View approved drone status | `GET /v1/viewer/devices`, `GET /v1/viewer/devices/{sn}` |
| View approved telemetry | `GET /v1/viewer/devices/{sn}/telemetry/latest`, SSE stream |
| View approved task/mission records | `GET /v1/viewer/tasks`, `GET /v1/viewer/tasks/{id}` |
| View approved alerts/events | `GET /v1/viewer/events` |
| View approved live monitoring cards | `GET /v1/viewer/devices/{sn}/live-stream` (if enabled by Shamal) |
| Download approved media files | `GET /v1/viewer/tasks/{id}/media`, `GET /v1/viewer/media/recent` |

### Viewer users CANNOT

| Prohibited action | Enforcement |
|-------------------|-------------|
| Access FH2 directly | No FH2 credentials issued to viewers |
| Control drone / dock | Block `POST /v1/*/ops/*` for viewer role (existing: `src/services/apiAccess.ts`) |
| Start / stop / edit / delete missions | No mission-write endpoints on viewer surface |
| Change FH2 settings | Admin-only |
| Access FH2 token | Server-side only in `src/config.ts` |
| Access webhook secret | Server-side only |
| Access other projects | Scoped to Shamal-configured `FH2_PROJECT_UUID` |
| Access Shamal internal admin functions | Block `/v1/*/admin/*` for non-admin roles |
| Access integration key management UI | Admin-only screens in `command-center.html` |
| Trigger camera/gimbal/payload/firmware operations | Operator/admin only; hidden from viewer UI |

**Existing partial implementation:** `isViewerReadOnlyAllowed()` in `src/services/apiAccess.ts` already restricts viewer role to GET on read paths. This iteration must extend path prefixes to `/v1/viewer/*` and harden UI so viewers never see operation/admin surfaces.

---

## 5. Marafiq naming correction

Marafiq is **only** an example external viewer user/company. It must **not** be the product identity.

### Remove / replace (product identity)

| Current (wrong as product identity) | Replace with |
|-------------------------------------|--------------|
| Shamal FH2 Middleware (Marafiq demo) | Shamal FH2 Viewer Middleware |
| Marafiq CAFM integration | External viewer integration |
| Marafiq-facing endpoints | Viewer-facing endpoints |
| Default Marafiq API key | Default viewer API key |
| Marafiq API matrix | Viewer API matrix |
| Marafiq submit sheet | Viewer handoff sheet |
| Marafiq integration app | External viewer integration guide |
| `registerMarafiqAuth` (internal name) | `registerViewerAuth` (or equivalent generic name) |
| `marafiqNotify.ts` | `viewerEventNotify.ts` (or equivalent) |

### Where Marafiq MAY remain

- Demo values (e.g. `demo-marafiq-key-change-me` in examples)
- Placeholder text (e.g. admin form: “e.g. Marafiq”)
- Migration notes explaining the rename
- Legacy doc copies with header: *“Marafiq is an example external viewer user/company.”*

### Files with Marafiq-specific identity today (must be updated)

| File | Issue |
|------|-------|
| `README.md` | Title “(Marafiq demo)”, Marafiq CAFM wording |
| `package.json` | `description` references Marafiq CAFM |
| `.env.example` | Section “Marafiq API access”, `MARAFIQ_*` vars |
| `docs/MARAFIQ_API_MATRIX.md` | Filename and content |
| `docs/MARAFIQ_SUBMIT.md` | Filename and content |
| `docs/HANDOFF.md` | “Marafiq CAFM integrators” framing |
| `docs/DEMO_SCRIPT.md` | Marafiq-specific script wording if present |
| `docs/CYBERSECURITY.md` | “for Marafiq”, Marafiq-centric architecture diagram |
| `openapi/shamal-marafiq-v1.yaml` | Filename; paths under `/v1/marafiq/` |
| `postman/Shamal-Marafiq-Middleware.postman_collection.json` | Collection name |
| `src/plugins/auth.ts` | `registerMarafiqAuth`, `/v1/marafiq` path checks |
| `src/config.ts` | `MARAFIQ_*` schema fields |
| `src/services/marafiqNotify.ts` | Service filename and references |
| `src/ui/command-center.html` | Product labels; API path strings |

---

## 6. Route strategy

**Do not break existing integrations.** All current `/v1/marafiq/*` routes must keep working during migration.

### 6A. Add generic primary routes

Register **new** canonical paths that delegate to the same handlers as today’s Marafiq routes:

| Method | New canonical path | Current equivalent |
|--------|-------------------|-------------------|
| GET | `/v1/viewer/devices` | `/v1/marafiq/devices` |
| GET | `/v1/viewer/devices/{sn}` | `/v1/marafiq/devices/{sn}` |
| GET | `/v1/viewer/devices/{sn}/telemetry/latest` | `/v1/marafiq/devices/{sn}/telemetry/latest` |
| GET | `/v1/viewer/devices/{sn}/telemetry/stream` | `/v1/marafiq/devices/{sn}/telemetry/stream` |
| GET | `/v1/viewer/devices/{sn}/live-stream` | `/v1/marafiq/devices/{sn}/live-stream` |
| GET | `/v1/viewer/tasks` | `/v1/marafiq/tasks` |
| GET | `/v1/viewer/tasks/{id}` | `/v1/marafiq/tasks/{id}` |
| GET | `/v1/viewer/tasks/{id}/media` | `/v1/marafiq/tasks/{id}/media` |
| GET | `/v1/viewer/tasks/{id}/trajectory` | `/v1/marafiq/tasks/{id}/trajectory` |
| GET | `/v1/viewer/tasks/{id}/trajectory.geojson` | `/v1/marafiq/tasks/{id}/trajectory.geojson` |
| GET | `/v1/viewer/tasks/{id}/trajectory.kml` | `/v1/marafiq/tasks/{id}/trajectory.kml` |
| GET | `/v1/viewer/events` | `/v1/marafiq/events` |
| POST | `/v1/viewer/events/{id}/ack` | `/v1/marafiq/events/{id}/ack` |
| GET | `/v1/viewer/fleet/summary` | `/v1/marafiq/fleet/summary` |
| GET | `/v1/viewer/fleet/positions` | `/v1/marafiq/fleet/positions` |
| GET | `/v1/viewer/docks` | `/v1/marafiq/docks` |
| GET | `/v1/viewer/docks/{sn}` | `/v1/marafiq/docks/{sn}` |
| GET | `/v1/viewer/mapping/models` | `/v1/marafiq/mapping/models` |
| GET | `/v1/viewer/mapping/models/{id}` | `/v1/marafiq/mapping/models/{id}` |
| GET | `/v1/viewer/capabilities` | `/v1/marafiq/capabilities` |
| GET | `/v1/viewer/media/recent` | `/v1/marafiq/media/recent` |

**Implementation approach:** Prefer registering both path prefixes on the same route handlers (Fastify route array or thin alias registrar) rather than duplicating handler logic.

**Auth paths** (also add viewer-prefixed aliases):

| New | Legacy alias |
|-----|--------------|
| `POST /v1/viewer/auth/login` | `POST /v1/marafiq/auth/login` |
| `GET /v1/viewer/auth/me` | `GET /v1/marafiq/auth/me` |

**Admin, ops, integration, and webhook routes** stay Shamal-internal. They are **not** part of the external viewer API surface. Legacy paths may remain under `/v1/marafiq/admin/*`, `/v1/marafiq/ops/*`, `/v1/marafiq/integration/*` for backward compatibility; new Shamal-internal docs should describe them as platform/admin routes, not “Marafiq routes.”

**Note on existing `/v1/marafiq/viewer/*` paths:** These are legacy integration-dashboard aliases (`src/routes/viewerIntegration.ts`). They are **not** the same as the new `/v1/viewer/*` REST namespace. Keep them as deprecated aliases; do not document them as the primary viewer API.

### 6B. Keep `/v1/marafiq/*` as legacy aliases

- All existing `/v1/marafiq/*` routes continue to respond identically.
- No behavior change for current API consumers until they choose to migrate.
- Add `Deprecation` response header or log warning (optional, low priority).

### 6C. Mark legacy in docs

- OpenAPI: tag legacy paths with `deprecated: true` and description “Use `/v1/viewer/*` instead.”
- README and handoff docs: single “Legacy routes” section listing `/v1/marafiq/*`.

### 6D. New artifacts use `/v1/viewer/*`

- Swagger / OpenAPI primary paths
- Postman collection requests
- `command-center.html` API copy helpers (viewer-facing examples)
- `docs/VIEWER_API_MATRIX.md`
- Demo scripts and integration guides

### Files to change for routes

| File | Change |
|------|--------|
| `src/routes/devices.ts` | Add `/v1/viewer/devices*` paths |
| `src/routes/tasks.ts` | Add `/v1/viewer/tasks*` paths |
| `src/routes/events.ts` | Add `/v1/viewer/events*` paths |
| `src/routes/fleet.ts` | Add `/v1/viewer/fleet/*` paths |
| `src/routes/docks.ts` | Add `/v1/viewer/docks*` paths |
| `src/routes/mapping.ts` | Add `/v1/viewer/mapping/*` paths |
| `src/routes/capabilities.ts` | Add `/v1/viewer/capabilities` |
| `src/routes/media.ts` | Add `/v1/viewer/media/recent` |
| `src/routes/telemetry-sse.ts` | Add `/v1/viewer/devices/*/telemetry/stream` |
| `src/routes/streams.ts` | Add `/v1/viewer/devices/*/live-stream` |
| `src/routes/gis.ts` | Add `/v1/viewer/tasks/*/trajectory.*` |
| `src/routes/auth.ts` | Add `/v1/viewer/auth/*` |
| `src/plugins/auth.ts` | Accept both `/v1/viewer` and `/v1/marafiq` prefixes |
| `src/services/apiAccess.ts` | Include `/v1/viewer/*` in viewer allowlists |
| `src/services/viewerScopes.ts` | Map scopes to `/v1/viewer/*` as canonical |
| `openapi/shamal-viewer-v1.yaml` | New spec with viewer paths primary |

---

## 7. Environment variable rename strategy

### Replace (canonical names)

| Legacy (Marafiq-specific) | New (generic viewer) |
|---------------------------|----------------------|
| `MARAFIQ_API_KEYS` | `VIEWER_API_KEYS` |
| `MARAFIQ_API_KEY_ROLES` | `VIEWER_API_KEY_ROLES` |
| `MARAFIQ_IP_ALLOWLIST` | `VIEWER_IP_ALLOWLIST` |
| `MARAFIQ_EVENT_CALLBACK_URL` | `VIEWER_EVENT_CALLBACK_URL` |
| `MARAFIQ_EVENT_CALLBACK_SECRET` | `VIEWER_EVENT_CALLBACK_SECRET` |

### Backward compatibility

In `src/config.ts`:

1. Parse `VIEWER_*` variables as primary.
2. If a `VIEWER_*` variable is unset, fall back to the corresponding `MARAFIQ_*` value.
3. Emit a one-time startup warning when legacy `MARAFIQ_*` vars are used without `VIEWER_*` equivalents.
4. Export a single internal config object (e.g. `config.viewerApiKeys`) so application code does not reference `MARAFIQ_*` names.

### Documentation

- `.env.example` must show only `VIEWER_*` names with a comment block explaining legacy fallback.
- `docs/CYBERSECURITY.md` and `docs/HANDOFF.md` must reference `VIEWER_*`.

### Example `.env.example` section (target)

```env
# External viewer API access (X-Api-Key)
VIEWER_API_KEYS=demo-viewer-key-change-me,viewer-demo,admin-demo
VIEWER_API_KEY_ROLES=demo-viewer-key-change-me:operator,viewer-demo:viewer,admin-demo:admin
VIEWER_IP_ALLOWLIST=
VIEWER_EVENT_CALLBACK_URL=
VIEWER_EVENT_CALLBACK_SECRET=
# Legacy: MARAFIQ_* names still work as fallback during migration
```

---

## 8. Documentation rename requirements

### Target file map

| Current | Action | New name (if renamed) |
|---------|--------|----------------------|
| `README.md` | Update content | — |
| `package.json` | Update `description` | — |
| `.env.example` | Update to `VIEWER_*` | — |
| `docs/MARAFIQ_API_MATRIX.md` | Rename + update | `docs/VIEWER_API_MATRIX.md` |
| `docs/MARAFIQ_SUBMIT.md` | Rename + update | `docs/VIEWER_SUBMIT.md` |
| `docs/HANDOFF.md` | Update framing | — |
| `docs/DEMO_SCRIPT.md` | Update wording | — |
| `docs/CYBERSECURITY.md` | De-Marafiq architecture | — |
| `openapi/shamal-marafiq-v1.yaml` | Rename + update paths | `openapi/shamal-viewer-v1.yaml` |
| `postman/Shamal-Marafiq-Middleware.postman_collection.json` | Rename collection | `postman/Shamal-FH2-Viewer-Middleware.postman_collection.json` |
| `src/server.ts` | Point OpenAPI loader to new file (keep serving legacy yaml optionally) | — |

### Legacy doc copies (optional)

If keeping old filenames for integrators who bookmarked them:

- Add banner at top: **“Legacy document. Marafiq is an example external viewer user/company. See `docs/VIEWER_API_MATRIX.md`.”**
- Link to canonical viewer docs.

### OpenAPI / Swagger content requirements

- `info.title`: “Shamal FH2 Viewer Middleware API” (or similar generic title)
- `info.description`: Shamal-controlled middleware; external integrators use `X-Api-Key`; never DJI credentials
- Primary paths: `/v1/viewer/*`
- Legacy paths: `/v1/marafiq/*` marked `deprecated: true`

---

## 9. UI / role correction

**File:** `src/ui/command-center.html`

### Viewer role UI (must show only)

Dashboard cards enabled in `data/viewer-dashboard-permissions.json` for that account:

- Fleet summary
- Dock status
- Drone status
- Telemetry
- Mission / task status
- Media download
- Alerts / events
- Live stream card **only if enabled by Shamal**

### Viewer role UI (must NOT show)

- Operation controls (`/v1/marafiq/ops/*` panel)
- Admin settings (`/v1/marafiq/admin/*`)
- FH2 configuration
- Integration key management
- User management
- Command / control buttons
- Drone / dock operation buttons
- Internal Shamal settings
- FH2 cockpit deep links as “your FH2” (viewer should not be directed to FH2 login)

### Operator / admin roles

- Unchanged capability for Shamal staff.
- UI labels should say “Shamal Platform” not “Marafiq Platform.”

### Frontend API paths

- New UI fetches should prefer `/v1/viewer/*`.
- Legacy `/v1/marafiq/*` strings in JS may remain temporarily if both work; migrate to viewer paths in same iteration.

---

## 10. Media access

External viewer users are mainly provided **approved media access** and **approved monitoring visibility**.

### Rules

| Rule | Detail |
|------|--------|
| Viewer download scope | Only media files exposed through `GET /v1/viewer/tasks/{id}/media` and `GET /v1/viewer/media/recent` |
| URL type | Time-limited signed URLs from FH2 (middleware returns metadata + URLs, not raw storage credentials) |
| No raw FH2 storage | Viewers must not receive unrestricted file lists or FH2 storage API access |
| Project scope | Media filtered to Shamal’s configured `FH2_PROJECT_UUID` |
| No permanent re-hosting | Unless separately agreed; default is pass-through signed links |

**Existing implementation:** `src/routes/media.ts`, `src/services/recentMedia.ts` — preserve behavior; update path prefixes and docs only unless a scope gap is found.

---

## 11. What NOT to change (preserve)

The following must **not** be removed or broken by this iteration:

| Area | Notes |
|------|-------|
| FH2 live / mock mode | `FH2_MODE=mock|live`, adapters unchanged in behavior |
| Device APIs | Same response shapes; new path aliases only |
| Task APIs | Same response shapes |
| Media APIs | Same signed-URL behavior |
| Telemetry APIs | REST + SSE |
| Event / webhook ingestion | `POST /webhooks/fh2`, MongoDB persistence |
| Admin login | Shamal admin role |
| Viewer login | Viewer role with read restrictions |
| Database persistence | MongoDB, `src/db/*` |
| Docker / local dev | `docker-compose.yml`, `scripts/setup-db.sh` |
| Rate limiting | Existing limits |
| Viewer dashboard permissions | `data/viewer-dashboard-permissions.json` model |
| Viewer integration accounts | `data/viewer-users.json`, `data/viewer-integrations.json` |

This iteration is mainly:

1. Product scope correction  
2. Naming cleanup  
3. Documentation cleanup  
4. Generic viewer API path addition  
5. Permission / UI hardening for viewer role  
6. Backward-compatible migration away from Marafiq-specific identity  

---

## 12. Implementation checklist

### Phase 1 — Documentation & config (low risk)

- [ ] Update `README.md` product title and description
- [ ] Update `package.json` description
- [ ] Update `.env.example` to `VIEWER_*` with legacy fallback note
- [ ] Add `VIEWER_*` parsing with `MARAFIQ_*` fallback in `src/config.ts`
- [ ] Rename docs per Section 8 (or add legacy banners)
- [ ] Update `docs/CYBERSECURITY.md` architecture diagram

### Phase 2 — API routes (backward compatible)

- [ ] Register `/v1/viewer/*` aliases on all read routes (Section 6A)
- [ ] Update `src/plugins/auth.ts` to guard both prefixes
- [ ] Update `src/services/apiAccess.ts` and `src/services/viewerScopes.ts`
- [ ] Add deprecation notes to legacy paths in OpenAPI

### Phase 3 — OpenAPI & Postman

- [ ] Create `openapi/shamal-viewer-v1.yaml` with viewer paths primary
- [ ] Update `src/server.ts` to load new spec; keep legacy yaml available
- [ ] Rename and update Postman collection
- [ ] Update Swagger `info.title` / `info.description` in `src/server.ts`

### Phase 4 — UI & internal naming

- [ ] Update `command-center.html` product labels and viewer-visible surfaces
- [ ] Switch API path constants to `/v1/viewer/*` for new examples
- [ ] Rename `registerMarafiqAuth` → generic name; update imports
- [ ] Rename `marafiqNotify.ts` → generic viewer notify service

### Phase 5 — Verification

- [ ] Run `npm run lint`
- [ ] Run `npm run test:readonly` (or manual smoke test)
- [ ] Verify legacy `/v1/marafiq/*` still responds
- [ ] Verify new `/v1/viewer/*` responds identically
- [ ] Verify viewer role cannot access ops/admin routes
- [ ] Verify `MARAFIQ_*` env fallback works

---

## 13. Acceptance criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | README no longer presents the app as Marafiq-only | README title/body review |
| 2 | `package.json` description is generic | Field check |
| 3 | `.env.example` uses `VIEWER_*` variables | File review |
| 4 | Old `MARAFIQ_*` env variables still work as fallback | Integration test with only `MARAFIQ_*` set |
| 5 | Swagger/OpenAPI title and description are generic | `/docs` UI review |
| 6 | New `/v1/viewer/*` routes exist | HTTP smoke test all paths in Section 6A |
| 7 | Old `/v1/marafiq/*` routes work as legacy aliases | Regression test existing Postman/readonly suite |
| 8 | Postman collection uses generic viewer naming | File name + request paths |
| 9 | Docs explain Marafiq only as an example | Doc review |
| 10 | Viewer user cannot access admin or operation control UI | Login as `CC_VIEWER_*`, UI audit |
| 11 | Viewer user cannot trigger drone, dock, mission, camera, payload, or firmware control | API 403 on ops POST; UI buttons hidden |
| 12 | `FH2_ORG_TOKEN` and `FH2_PROJECT_UUID` remain Shamal-only secrets | No exposure in viewer API responses |
| 13 | Media download limited to approved project media | Scope review on media routes |
| 14 | No direct DJI FH2 access given to any external viewer user | Security review / `docs/CYBERSECURITY.md` |
| 15 | Existing FH2 live/mock, DB, Docker workflows still work | `docker compose up`, `npm run dev` smoke test |

---

## 14. Out of scope (this iteration)

- Rebuilding the application from scratch
- Removing working features
- Breaking `/v1/marafiq/*` without alias period
- Multi-tenant FH2 org support (future)
- Per-viewer-company FH2 project mapping (future; today all viewers see Shamal’s configured project scope)
- Removing operator role (Shamal staff may still need ops UI)

---

## 15. Glossary

| Term | Meaning |
|------|---------|
| **Shamal platform** | This middleware + Command Center UI + APIs |
| **Viewer user** | External read-only (or card-limited) user issued credentials by Shamal |
| **Operator** | Shamal staff with mission/device operation access via platform |
| **Admin** | Shamal staff managing viewer accounts, keys, and settings |
| **FH2** | DJI FlightHub 2 |
| **Legacy alias** | `/v1/marafiq/*` route kept for backward compatibility |
| **Marafiq** | Example external viewer company; not the product name |

---

*End of PRD — Shamal FH2 External Viewer Middleware correction iteration.*
