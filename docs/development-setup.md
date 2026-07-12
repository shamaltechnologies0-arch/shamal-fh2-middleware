# Development Setup

## Prerequisites

- **Node.js** 20 or later
- **npm** (comes with Node)
- **MongoDB** 7 (optional — local JSON files work for basic dev)
- **Docker** (optional — for `db:setup`)

## Clone and install

```bash
git clone <repo-url>
cd shamal-fh2-middleware
npm install
cd apps/web && npm install && cd ../..
```

## Environment

```bash
cp .env.example .env
```

Minimum for local mock mode:

```env
FH2_MODE=mock
PORT=8080
```

For live FH2:

```env
FH2_MODE=live
FH2_ORG_TOKEN=<your-org-token>
FH2_PROJECT_UUID=<project-uuid>
```

See [environment-variables.md](environment-variables.md) for the full list.

## Running locally

### API server (with hot reload)

```bash
npm run dev
```

Starts Fastify on `http://localhost:8080`.

### Frontend dev server

```bash
npm run dev:web
```

Starts Vite on `http://localhost:5173` with proxy to the API.

### Database (optional)

```bash
npm run db:setup     # Starts MongoDB via Docker
npm run db:migrate   # Creates indexes
```

## Building

```bash
npm run build        # Frontend + backend + asset copy
npm start            # Production server
```

## Linting

```bash
npm run lint         # Backend TypeScript check
npm run lint:web     # Frontend oxlint + build check
```

## Integration tests

```bash
npm run test:viewer-routes
npm run test:rest-api-keys
npm run test:service-accounts
npm run test:fh2-projects
npm run test:readonly
```

## Project structure

See [folder-structure.md](folder-structure.md) and [architecture.md](architecture.md).

## Common tasks

| Task | Command |
|------|---------|
| Seed demo event | `npm run seed:demo-event` |
| Run demo script | `npm run demo` |
| Probe FH2 API | `tsx scripts/probe-fh2.ts` |
