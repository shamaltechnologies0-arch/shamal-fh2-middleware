# Environment Variables

All environment variables are validated in `apps/api/src/config/env.ts` using Zod.

Copy `.env.example` to `.env` for local development.

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `LOG_LEVEL` | `info` | Fastify log level |
| `HTTPS_REQUIRED` | `false` | Require HTTPS |
| `HTTPS_KEY_PATH` | — | TLS key path |
| `HTTPS_CERT_PATH` | — | TLS cert path |

## FlightHub 2

| Variable | Default | Description |
|----------|---------|-------------|
| `FH2_MODE` | `mock` | `mock` or `live` |
| `FH2_BASE_URL` | DJI US API URL | FH2 API base |
| `FH2_ORG_TOKEN` | — | Organization token (live mode) |
| `FH2_PROJECT_UUID` | — | Default project UUID (live mode) |
| `FH2_LANGUAGE` | `en` | API language |
| `FH2_LIVE_SHARE_URL` | — | Live share URL override |
| `FH2_COCKPIT_URL` | — | Cockpit URL override |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017` | MongoDB connection |
| `MONGODB_DB_NAME` | `shamal_middleware` | Database name |

## Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `PLATFORM_SESSION_SECRET` | auto (local) | Session signing secret |
| `CC_SESSION_SECRET` | — | Legacy alias for session secret |
| `VIEWER_API_KEYS` | — | Comma-separated API keys |
| `VIEWER_API_KEY_ROLES` | — | `key:role` mappings |
| `VIEWER_IP_ALLOWLIST` | — | Comma-separated allowed IPs |
| `admin_id` / `admin_password` | — | Platform admin credentials |
| `CC_ADMIN_ID` / `CC_ADMIN_PASSWORD` | — | Legacy admin credential names |
| `CC_OPERATOR_ID` / `CC_OPERATOR_PASSWORD` | — | Operator credentials |
| `CC_VIEWER_ID` / `CC_VIEWER_PASSWORD` | — | Viewer credentials |

## Webhooks & callbacks

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_SECRET` | `change-me-webhook-secret` | FH2 webhook verification |
| `VIEWER_EVENT_CALLBACK_URL` | — | Event notification URL |
| `VIEWER_EVENT_CALLBACK_SECRET` | — | Callback signing secret |

## Rate limiting & telemetry

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `TELEMETRY_SSE_INTERVAL_MS` | `10000` | SSE telemetry poll interval |

## Public URLs

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_API_BASE_URL` | — | Public API base for OpenAPI |

## Security notes

- Never expose `FH2_ORG_TOKEN`, `PLATFORM_SESSION_SECRET`, or `WEBHOOK_SECRET` to frontend code
- In production/serverless, `PLATFORM_SESSION_SECRET` is required (no auto-generated file)
- Local dev auto-generates a secret in `data/.platform-session-secret`
