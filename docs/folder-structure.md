# Folder Structure

## Top level

```
shamal-fh2-middleware/
├── apps/
│   ├── api/                    # Backend (Fastify)
│   │   └── src/
│   └── web/                    # Frontend (React + Vite)
├── packages/
│   ├── shared/                 # Shared constants/helpers
│   └── types/                  # Shared TypeScript types
├── docs/                       # Documentation
├── scripts/                    # Integration tests & tooling
├── infrastructure/
│   ├── docker/                 # Dockerfile, docker-compose
│   └── vercel/                 # Vercel config copy
├── tests/                      # (reserved for future unit/e2e tests)
├── api/                        # Vercel serverless entry
├── data/                       # Local JSON persistence
├── openapi/                    # OpenAPI specifications
├── postman/                    # Postman collection
├── public/                     # Vercel static output
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

## Backend (`apps/api/src/`)

```
apps/api/src/
├── main.ts                     # Entry point
├── server.ts                   # HTTP listener
├── bootstrap.ts                # App singleton init
├── app.ts                      # Fastify assembly
├── config/
│   └── env.ts                  # Zod-validated environment
├── types/
│   └── fastify.d.ts            # Fastify request augmentation
├── modules/
│   ├── auth/
│   │   ├── presentation/routes/auth.routes.ts
│   │   ├── infrastructure/command-center-auth.service.ts
│   │   ├── infrastructure/platform-secret.service.ts
│   │   └── shared/session-cookie.ts
│   ├── api-keys/
│   ├── service-accounts/
│   ├── users/
│   ├── projects/
│   ├── integrations/
│   ├── admin/
│   ├── devices/
│   ├── docks/
│   ├── fleet/
│   ├── tasks/
│   ├── media/
│   ├── events/
│   ├── webhooks/
│   ├── operations/
│   ├── gis/
│   ├── streams/
│   ├── mapping/
│   ├── platform/
│   ├── health/
│   └── capabilities/
├── shared/
│   ├── http/viewer-paths.ts
│   ├── security/api-access.ts
│   ├── normalize/normalize.service.ts
│   └── openapi/openapi-documents.service.ts
├── infrastructure/
│   ├── database/
│   ├── persistence/
│   ├── fh2/
│   └── auth/
└── assets/
    ├── ui/                     # Built SPA + legacy HTML
    ├── logo/
    ├── bg-image/
    └── fixtures/               # FH2 mock data
```

## Frontend (`apps/web/src/`)

```
apps/web/src/
├── app/
│   ├── App.tsx
│   └── main.tsx
├── domains/
│   ├── auth/
│   │   ├── components/login-screen.tsx
│   │   ├── contexts/auth-context.tsx
│   │   └── services/auth.service.ts
│   └── platform/
│       ├── components/legacy-portal.tsx
│       └── legacy/             # Embedded portal markup/CSS
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   ├── layout/                 # Header, sidebar, portal layout
│   └── shared/                 # Data table, dialogs, badges, etc.
├── hooks/
├── lib/
├── styles/
├── assets/
└── config/
```

## Packages

```
packages/
├── shared/src/
│   └── constants/session.ts
└── types/src/
    └── auth/session.types.ts
```
