# Deployment

## Node standalone

```bash
npm run build
NODE_ENV=production npm start
```

Listens on `PORT` (default 8080). Requires `PLATFORM_SESSION_SECRET` in production.

## Docker

Configs live in `infrastructure/docker/`:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

Or from repo root (convenience symlink):

```bash
docker compose up --build
```

The Dockerfile multi-stage build:
1. Installs root + web dependencies
2. Builds frontend into `apps/api/src/assets/ui/dist`
3. Compiles TypeScript to `dist/apps/api/src/`
4. Copies assets into dist

## Vercel

- Entry: `api/index.ts` (serverless Fastify handler)
- Config: `vercel.json` (rewrites all traffic to API)
- Build: `npm run build` + static file copy to `public/`

On Vercel:
- Filesystem is read-only — persistence uses MongoDB (`MONGODB_URI`)
- Set `PLATFORM_SESSION_SECRET` in Vercel environment variables
- `data/` JSON files are included via `includeFiles` in vercel.json

## Environment checklist (production)

- [ ] `NODE_ENV=production`
- [ ] `PLATFORM_SESSION_SECRET` (32+ chars)
- [ ] `MONGODB_URI` (for serverless/multi-instance)
- [ ] `FH2_MODE=live` with `FH2_ORG_TOKEN` and `FH2_PROJECT_UUID`
- [ ] `WEBHOOK_SECRET` changed from default
- [ ] `admin_id` / `admin_password` set

## Static assets

The API serves:
- SPA from `assets/ui/dist/` (or legacy `command-center.html` fallback)
- Background image from `assets/bg-image/`
- Logo from `assets/logo/`
- Legacy portal JS from `portal-legacy.js`

Frontend build output path: `apps/api/src/assets/ui/dist/`
