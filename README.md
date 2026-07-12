# Shamal Platform (FH2 Middleware)

Shamal Platform is a full-stack middleware between **DJI FlightHub 2** and external viewers/integrators. It provides restricted API access, a web command center, admin tooling, and integration endpoints for third-party systems.

## Repository layout

| Area | Location | Description |
|------|----------|-------------|
| **Frontend** | `apps/web/` | React 19 + Vite SPA (command center shell) |
| **Backend API** | `apps/api/src/` | Fastify 5 REST API with DDD modules |
| **Shared packages** | `packages/` | Cross-cutting types and constants |
| **Infrastructure** | `infrastructure/` | Docker, Vercel deployment configs |
| **Scripts / tests** | `scripts/` | Integration smoke tests and tooling |
| **Documentation** | `docs/` | Architecture, setup, deployment guides |
| **OpenAPI** | `openapi/` | API specifications |
| **Local data** | `data/` | JSON persistence (local dev fallback) |

## Quick start

### Prerequisites

- Node.js 20+
- MongoDB (optional for local dev — JSON files in `data/` work as fallback)

### Install

```bash
npm install
cd apps/web && npm install && cd ../..
```

### Environment

```bash
cp .env.example .env
# Edit .env with your FH2 credentials and secrets
```

### Run backend only

```bash
npm run dev
# API: http://localhost:8080
```

### Run frontend only (proxies API)

```bash
npm run dev:web
# UI: http://localhost:5173
```

### Run both

```bash
npm run dev:web   # terminal 1
npm run dev       # terminal 2
```

### Build for production

```bash
npm run build
npm start
```

### Database

```bash
npm run db:setup    # Docker MongoDB
npm run db:migrate  # Create indexes
```

### Tests

```bash
npm run test:viewer-routes
npm run test:rest-api-keys
npm run test:service-accounts
npm run test:readonly
```

## Import aliases

| Alias | Resolves to |
|-------|-------------|
| `@web/*` | `apps/web/src/*` |
| `@ui/*` | `apps/web/src/components/ui/*` |
| `@api/*` | `apps/api/src/*` (TypeScript paths) |

## Further reading

- [Architecture](docs/architecture.md)
- [Folder structure](docs/folder-structure.md)
- [Domain boundaries](docs/domain-boundaries.md)
- [Development setup](docs/development-setup.md)
- [Environment variables](docs/environment-variables.md)
- [Deployment](docs/deployment.md)
