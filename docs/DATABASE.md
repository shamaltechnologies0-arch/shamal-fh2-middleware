# MongoDB — why and how

## What uses the database

| Feature | Storage |
|---------|---------|
| **Alerts / events** (`GET /v1/viewer/events`, webhooks) | **MongoDB** |
| **Integration accounts** (Admin Settings) | **MongoDB** (`platform_data`) |
| **REST API keys** | **MongoDB** (`platform_data`) |
| **Integration Bearer keys** | **MongoDB** (`platform_data`) |
| **Dashboard permissions** | **MongoDB** (`platform_data`) |
| **FH2 project sync & assignments** | **MongoDB** (`platform_data`) |
| **Service accounts** | **MongoDB** (`platform_data`) |

Locally without MongoDB, admin data falls back to JSON files under `data/`. On **Vercel**, `MONGODB_URI` is required — the filesystem is read-only.

If MongoDB is unreachable at startup the server will fail to start.

## Local setup (Docker — recommended)

```bash
docker compose up mongodb -d
./scripts/setup-db.sh
```

Add to `.env`:

```env
MONGODB_URI=mongodb://localhost:27017/shamal_middleware
```

Start the API (`npm run dev` or `docker compose up`). You should **not** see the MongoDB warning.

## Full stack with Docker

```bash
docker compose up --build
```

The API container uses `mongodb://mongodb:27017/shamal_middleware` automatically.

## Production (Vercel / Atlas)

1. Create a cluster in [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Add `MONGODB_URI` in Vercel → Settings → Environment Variables (Production).
3. Allow Vercel egress IPs in Atlas Network Access (or `0.0.0.0/0` for testing).
4. Run indexes once: `npm run db:migrate` (locally against the Atlas URI).

Collection: `webhook_events` with indexes on `received_at` and `event_type`.

Admin/platform settings use collection `platform_data` (document `_id` per store key, e.g. `viewer_users`).
