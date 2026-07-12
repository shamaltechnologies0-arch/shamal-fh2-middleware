# Tests

Integration and smoke tests live in `scripts/` and are invoked via root `package.json` scripts:

| Script | Purpose |
|--------|---------|
| `npm run test:readonly` | Read-only API smoke tests |
| `npm run test:viewer-routes` | Canonical vs legacy route aliases |
| `npm run test:rest-api-keys` | REST API key CRUD |
| `npm run test:service-accounts` | Service account OAuth flow |
| `npm run test:fh2-projects` | FH2 project management |

Unit tests (`*.spec.ts`) and e2e tests can be added here in future:

```
tests/
├── unit/
├── integration/
└── e2e/
```

Currently there is no Jest/Vitest unit test framework configured.
