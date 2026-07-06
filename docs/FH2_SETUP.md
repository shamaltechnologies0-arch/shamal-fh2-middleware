# FlightHub 2 credentials (Shamal)

## 1. Enable FlightHub Sync

1. Log in to **DJI FlightHub 2** as organization admin.
2. Go to **My Organization → Organization Settings → FlightHub Sync**.
3. Complete Sync configuration per the DJI user guide.
4. Copy the **Organization Key**.

## 2. Configure middleware

```bash
cp .env.example .env
```

Set:

```env
FH2_MODE=live
FH2_ORG_TOKEN=<Organization Key from step 1>
FH2_PROJECT_UUID=<from project list API>
```

## 3. Discover project UUID

```bash
curl -s "${FH2_BASE_URL}/openapi/v0.1/project" \
  -H "X-User-Token: ${FH2_ORG_TOKEN}" \
  -H "X-Request-Id: $(uuidgen)" \
  -H "X-Language: en" | jq .
```

Use `data.list[].uuid` for the pilot project.

## 4. Regional API host

Confirm `FH2_BASE_URL` for your tenant:

| Region | Example host |
|--------|----------------|
| US / International | `https://es-flight-api-us.djigate.com` |
| China | `https://es-flight-api-cn.djigate.com` |

If calls fail with DNS or 404, check DJI enterprise support or your dealer portal for the correct host.

## 5. Smoke test

```bash
curl -s "${FH2_BASE_URL}/openapi/v0.1/project/device" \
  -H "X-User-Token: ${FH2_ORG_TOKEN}" \
  -H "X-Project-Uuid: ${FH2_PROJECT_UUID}" \
  -H "X-Request-Id: $(uuidgen)" \
  -H "X-Language: en" | jq .
```

## 6. Organization Key permissions (GPS + live stream)

If devices show **online** in Shamal Platform but **latitude/longitude are empty** or live stream fails with **403 Forbidden**, the Organization Key is missing API scopes.

In **FlightHub 2 → My Organization → Organization Settings → FlightHub Sync**:

1. Regenerate or edit the Organization Key.
2. Enable permissions for **Device Management** (device state / object model) and **Livestream**.
3. Update `FH2_ORG_TOKEN` in `.env` and restart the middleware.

Required OpenAPI calls:

| Feature | FH2 endpoint |
|---------|----------------|
| GPS / battery / altitude | `GET /openapi/v0.1/device/{sn}/state` |
| Live video (WHEP) | `POST /openapi/v0.1/live-stream/start` |

Until permissions are enabled, Shamal Platform shows **cached** GPS from the last successful snapshot (if any) and a yellow banner on the fleet map.

## Security

- Never share `FH2_ORG_TOKEN` with external viewer.
- external viewer receives only `X-Api-Key` for Shamal middleware.
