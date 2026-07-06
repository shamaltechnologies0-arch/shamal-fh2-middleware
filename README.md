# Shamal FH2 External Viewer Middleware

Shamal-controlled middleware and viewer layer that reads approved data from Shamal’s **DJI FlightHub 2** and exposes restricted viewer access to external integrators (e.g. CAFM platforms, dashboards).

Shamal owns and operates FlightHub 2. External viewer users connect to **Shamal’s platform only** — never to DJI FH2 directly.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:8080
- Swagger: http://localhost:8080/docs
- Default viewer API key: `demo-viewer-key-change-me` (set in `.env` via `VIEWER_API_KEYS`)

## Local development (without Docker)

```bash
npm install
./scripts/setup-db.sh   # optional — persists alerts/events (see docs/DATABASE.md)
npm run dev
```

## Modes

| `FH2_MODE` | Behavior |
|------------|----------|
| `mock` | Fixture data (default) |
| `live` | Calls FlightHub 2 when `FH2_ORG_TOKEN` + `FH2_PROJECT_UUID` are set |

See [docs/FH2_SETUP.md](docs/FH2_SETUP.md) for Organization Key setup.

## Demo

```bash
chmod +x scripts/demo.sh
./scripts/demo.sh
npm run seed:demo-event   # optional: populate events table
```

## Documentation

- [PHASE2.md](docs/PHASE2.md) — Phase 2 endpoints (GIS, docks, streams, mapping)
- [VIEWER_API_MATRIX.md](docs/VIEWER_API_MATRIX.md) — External viewer API matrix
- [VIEWER_SUBMIT.md](docs/VIEWER_SUBMIT.md) — Handoff sheet for external viewer integrators
- [FH2_SETUP.md](docs/FH2_SETUP.md)
- [CYBERSECURITY.md](docs/CYBERSECURITY.md)
- [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- [HANDOFF.md](docs/HANDOFF.md)
- Postman: `postman/Shamal-FH2-Viewer-Middleware.postman_collection.json`

See [PRD.md](PRD.md) for product positioning.

## License

Proprietary — Shamal Technologies.
