# Domain Boundaries

## Bounded contexts

| Domain | Module path | Routes | Key services |
|--------|-------------|--------|--------------|
| **Auth** | `modules/auth/` | `/v1/auth/*` | Session login, platform secret |
| **Users** | `modules/users/` | (via admin) | Viewer users, dashboard permissions |
| **API Keys** | `modules/api-keys/` | `/v1/api-keys/*` | REST API key CRUD |
| **Service Accounts** | `modules/service-accounts/` | `/v1/service-accounts/*` | M2M OAuth tokens |
| **Projects** | `modules/projects/` | (via admin) | FH2 project sync, scoping |
| **Integrations** | `modules/integrations/` | `/v1/platform/integration/*` | Scoped integration API |
| **Admin** | `modules/admin/` | `/v1/platform/admin/*` | Platform administration |
| **Fleet** | `modules/fleet/` | `/v1/fleet/*` | Fleet summary, positions |
| **Devices** | `modules/devices/` | `/v1/devices/*` | Device listing, telemetry SSE |
| **Docks** | `modules/docks/` | `/v1/docks/*` | Dock listing |
| **Tasks** | `modules/tasks/` | `/v1/tasks/*` | Missions, trajectories |
| **Media** | `modules/media/` | `/v1/media/*` | Recent media |
| **Events** | `modules/events/` | `/v1/events/*` | Alerts, acknowledgements |
| **Webhooks** | `modules/webhooks/` | `/webhooks/fh2` | FH2 webhook ingress |
| **Operations** | `modules/operations/` | `/v1/platform/ops/*` | Flight/dock commands |
| **GIS** | `modules/gis/` | `/v1/tasks/*/trajectory.*` | GeoJSON/KML exports |
| **Streams** | `modules/streams/` | `/v1/devices/*/live-stream` | Live camera info |
| **Mapping** | `modules/mapping/` | `/v1/mapping/*` | Mapping models |
| **Platform UI** | `modules/platform/` | `/`, `/admin`, `/settings` | SPA serving |
| **Health** | `modules/health/` | `/health` | Health check |
| **Capabilities** | `modules/capabilities/` | `/v1/capabilities` | API discovery |

## Cross-cutting concerns

| Concern | Location | Notes |
|---------|----------|-------|
| Auth middleware | `infrastructure/auth/` | All request authentication |
| Route aliases | `shared/http/viewer-paths.ts` | Canonical + legacy path registration |
| RBAC | `shared/security/api-access.ts` | Role and read-only enforcement |
| Persistence | `infrastructure/persistence/` | JSON/MongoDB key-value store |
| FH2 integration | `infrastructure/fh2/` | Anti-corruption layer for DJI API |
| Configuration | `config/env.ts` | Single source for env vars |

## Layer rules

- **Domain/application code** must not import Fastify, MongoDB, or UI code directly
- **Presentation** (routes) delegates to application services
- **Infrastructure** implements external dependencies (DB, FH2, crypto)
- **Shared** contains only genuinely cross-domain utilities

## Frontend domains

| Domain | Path | Scope |
|--------|------|-------|
| Auth | `domains/auth/` | Login screen, session context, auth API client |
| Platform | `domains/platform/` | Legacy portal embed only |

All other UI components are layout (`components/layout/`) or shared primitives (`components/ui/`, `components/shared/`).
