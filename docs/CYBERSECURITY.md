# Cybersecurity brief — Shamal FH2 External Viewer Middleware

## Architecture

```text
External viewer platform  →  Shamal FH2 Viewer Middleware (HTTPS)  →  DJI FlightHub 2 OpenAPI
```

- Shamal owns and operates DJI FlightHub 2.
- External viewer users (e.g. Marafiq) connect to **Shamal’s platform only**.
- DJI organization key stays on Shamal infrastructure only.
- External viewers must **never** receive FH2 login, credentials, organization access, or control operations.

## Transport

- TLS 1.2+ required in production.
- No plain HTTP except local development.

## Authentication

| Actor | Credential | Scope |
|-------|------------|-------|
| External viewer integrators | `X-Api-Key` (rotatable per viewer) | Shamal `/v1/marafiq/*` viewer routes (legacy aliases; `/v1/viewer/*` planned) |
| Shamal backend | `FH2_ORG_TOKEN` + `FH2_PROJECT_UUID` | FlightHub 2 OpenAPI |
| FH2 webhooks | HMAC `X-Webhook-Signature` | `POST /webhooks/fh2` only |
| Shamal platform users | Session + role (admin / operator / viewer) | Command Center UI |

Optional: `VIEWER_IP_ALLOWLIST` for source IP restriction (legacy: `MARAFIQ_IP_ALLOWLIST`).

## Data handling

- Media URLs from DJI are **time-limited signed links**; middleware returns metadata and URLs for **approved project media only**, not raw FH2 storage credentials or unrestricted file lists.
- Webhook payloads stored in MongoDB for audit and `GET /events` (retention policy: configure per contract, default 90 days recommended).

## Access control

- Read-only viewer API surface (no mission control, no device commands for viewer role).
- Shamal operator/admin roles may access operation endpoints; viewers cannot.
- Rate limiting: 100 requests/minute per instance (configurable).

## Shamal-only secrets

Never expose to external viewers:

- `FH2_ORG_TOKEN`
- `FH2_PROJECT_UUID`
- `WEBHOOK_SECRET`
- `CC_SESSION_SECRET`
- Admin / operator credentials

## Audit

- Request IDs propagated via `X-Request-Id`.
- Application logs include correlation ID, route, status (no FH2 tokens in logs).

## Residency

- Demo: Shamal-hosted VPS recommended.
- Production: align host region with viewer contract data requirements before go-live.

## Incident response

- Rotate `VIEWER_API_KEYS` (or legacy `MARAFIQ_API_KEYS`) and `FH2_ORG_TOKEN` independently.
- Disable a viewer’s API keys without affecting Shamal FH2 operations.
