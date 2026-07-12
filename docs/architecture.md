# Architecture

## Overview

Shamal Platform uses a **monorepo-style layout** with separate frontend and backend applications, backend organized by **Domain-Driven Design** bounded contexts.

```
┌─────────────────────────────────────────────────────────────┐
│                        apps/web                              │
│  React SPA shell + legacy portal embed                       │
│  domains: auth, platform                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP /v1/*
┌──────────────────────────▼──────────────────────────────────┐
│                        apps/api                              │
│  Fastify 5 REST API                                          │
│  modules: auth, fleet, devices, tasks, ...                   │
└──────────┬───────────────────────────────┬──────────────────┘
           │                               │
┌──────────▼──────────┐         ┌──────────▼──────────┐
│  MongoDB / data/    │         │  DJI FlightHub 2    │
│  (persistence)      │         │  (fh2 adapter)      │
└─────────────────────┘         └─────────────────────┘
```

## Backend layers

Each module under `apps/api/src/modules/` follows DDD layering where applicable:

| Layer | Responsibility | Examples |
|-------|----------------|----------|
| **presentation** | HTTP routes, request validation | `*.routes.ts` |
| **application** | Use cases, orchestration | `*.service.ts` |
| **infrastructure** | External integrations, crypto | FH2 client, service-account crypto |
| **shared** | Cross-module utilities | `viewer-paths.ts`, `api-access.ts` |

Global infrastructure lives in `apps/api/src/infrastructure/`:

- `database/` — MongoDB client and migrations
- `persistence/` — Platform key-value store (JSON/MongoDB)
- `fh2/` — FlightHub 2 anti-corruption layer (mock + live adapters)
- `auth/` — Fastify auth plugins (middleware)

Configuration is centralized in `apps/api/src/config/env.ts` (Zod-validated).

## Authentication flows

1. **Session auth** — Login via `/v1/auth/login`, HMAC-signed `X-CC-Session` cookie
2. **API key auth** — `X-Api-Key` header for REST integrations
3. **Service accounts** — OAuth2 client-credentials Bearer tokens
4. **Integration tokens** — Scoped `shm_live_*` tokens for platform integration API

Authorization is enforced in `infrastructure/auth/platform-auth.plugin.ts` with role checks (`viewer` / `operator` / `admin`) and project scoping.

## Frontend architecture

The React app (`apps/web`) is a **thin shell** around a legacy portal:

- `domains/auth/` — Login, session management
- `domains/platform/` — Legacy portal embed (markup, CSS, JS)
- `components/ui/` — shadcn/ui primitives
- `components/layout/` — Header, sidebar, portal layout
- `components/shared/` — Reusable non-domain components

Vite builds into `apps/api/src/assets/ui/dist/` which the API serves at `/`.

## Deployment targets

- **Docker** — `infrastructure/docker/`
- **Vercel serverless** — Root `api/index.ts` + `vercel.json`
- **Node standalone** — `npm run build && npm start`

## API surface

All public routes preserve existing paths (`/v1/*`, legacy `/v1/viewer/*` aliases). OpenAPI specs in `openapi/`.
