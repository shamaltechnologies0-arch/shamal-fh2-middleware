/**
 * Client-account data permissions must be enforced on REST routes in /docs,
 * not only on /v1/platform/integration/*.
 * Usage: npm run test:client-permissions
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function main(): Promise<void> {
  process.env.VIEWER_API_KEYS = "perm-admin-key";
  process.env.VIEWER_API_KEY_ROLES = "perm-admin-key:admin";
  process.env.CC_ADMIN_ID = "admin";
  process.env.CC_ADMIN_PASSWORD = "admin1234";
  process.env.FH2_MODE = "mock";
  process.env.FH2_PROJECT_UUID = "550e8400-e29b-41d4-a716-446655440000";

  const dataDir = join(process.cwd(), "data");
  const envPath = join(process.cwd(), ".env");
  const paths = {
    users: join(dataDir, "viewer-users.json"),
    keys: join(dataDir, "viewer-rest-api-keys.json"),
    perms: join(dataDir, "viewer-dashboard-permissions.json"),
    integrations: join(dataDir, "viewer-integrations.json"),
    sa: join(dataDir, "service-accounts.json"),
    projects: join(dataDir, "fh2-projects.json"),
    env: envPath,
  };

  const backups = Object.fromEntries(
    Object.entries(paths).map(([key, filePath]) => [
      key,
      existsSync(filePath) ? readFileSync(filePath, "utf8") : null,
    ]),
  ) as Record<keyof typeof paths, string | null>;

  writeFileSync(
    envPath,
    [
      "FH2_MODE=mock",
      "VIEWER_API_KEYS=perm-admin-key",
      "VIEWER_API_KEY_ROLES=perm-admin-key:admin",
      "CC_ADMIN_ID=admin",
      "CC_ADMIN_PASSWORD=admin1234",
      "FH2_PROJECT_UUID=550e8400-e29b-41d4-a716-446655440000",
      "",
    ].join("\n"),
    "utf8",
  );

  for (const filePath of [
    paths.users,
    paths.keys,
    paths.perms,
    paths.integrations,
    paths.sa,
  ]) {
    if (existsSync(filePath)) rmSync(filePath);
  }
  writeFileSync(paths.projects, JSON.stringify({ projects: [], assignments: {} }), "utf8");

  const { buildServer } = await import("../apps/api/src/app.js");
  const { dataScopeRequirementForPath } = await import(
    "../apps/api/src/modules/integrations/application/viewer-scopes.service.js"
  );
  const app = await buildServer();
  await app.ready();

  let failed = 0;
  const fail = (message: string) => {
    failed += 1;
    console.error(`FAIL ${message}`);
  };

  const expectMap: Array<{ path: string; query?: Record<string, string>; scope: string }> = [
    { path: "/v1/fleet/positions", scope: "gps:read" },
    { path: "/v1/fleet/summary", scope: "fleet:read" },
    { path: "/v1/devices", scope: "fleet:read" },
    { path: "/v1/devices/SN1/telemetry/latest", scope: "drone:read|dock:read" },
    { path: "/v1/devices/SN1/live-stream", query: { camera: "drone" }, scope: "fpv:read" },
    { path: "/v1/events", scope: "events:read" },
    { path: "/v1/media/recent", scope: "media:read" },
    { path: "/v1/platform/integration/gps-location", scope: "gps:read" },
  ];

  for (const row of expectMap) {
    const requirement = dataScopeRequirementForPath(row.path, row.query);
    const got =
      requirement.kind === "any" ? requirement.scopes.join("|") : requirement.kind;
    if (got !== row.scope) {
      fail(`scope map ${row.path}: expected ${row.scope} got ${got}`);
    } else {
      console.log(`OK   scope map ${row.path} → ${row.scope}`);
    }
  }

  const adminHeaders = { "x-api-key": "perm-admin-key", "x-cc-session": "" };

  try {
    const loginAdmin = await app.inject({
      method: "POST",
      url: "/v1/viewer/auth/login",
      payload: { username: "admin", password: "admin1234" },
      headers: { "x-api-key": "perm-admin-key" },
    });
    if (loginAdmin.statusCode !== 200) {
      throw new Error(`Admin login failed: ${loginAdmin.statusCode} ${loginAdmin.body}`);
    }
    adminHeaders["x-cc-session"] = loginAdmin.json().data.sessionToken as string;

    const createClient = await app.inject({
      method: "POST",
      url: "/v1/platform/admin/integration-accounts",
      headers: adminHeaders,
      payload: {
        username: "clientaccount",
        password: "viewer1234",
        displayName: "Client Account",
      },
    });
    if (createClient.statusCode !== 201) {
      throw new Error(`Create client failed: ${createClient.statusCode} ${createClient.body}`);
    }
    const created = createClient.json().data as {
      apiKey: string;
      integrationAccessKey: string;
    };

    const restrict = await app.inject({
      method: "PATCH",
      url: "/v1/platform/admin/integration-accounts/clientaccount/access",
      headers: adminHeaders,
      payload: {
        fleetOverview: true,
        droneTelemetry: false,
        dockTelemetry: false,
        batteryStatus: true,
        gpsLocation: false,
        onlineOffline: true,
        liveCamera: false,
        droneFpv: false,
        alertsEvents: false,
        missionMediaHistory: false,
      },
    });
    if (restrict.statusCode !== 200) {
      fail(`restrict permissions: ${restrict.statusCode}`);
    } else {
      console.log("OK   client account GPS and telemetry disabled");
    }

    const clientHeaders = { "x-api-key": created.apiKey };
    const integrationHeaders = {
      authorization: `Bearer ${created.integrationAccessKey}`,
    };

    const docs = await app.inject({ method: "GET", url: "/docs" });
    if (docs.statusCode !== 200) fail(`docs remain public: ${docs.statusCode}`);
    else console.log("OK   /docs stays public");

    const unauth = await app.inject({ method: "GET", url: "/v1/fleet/positions" });
    if (unauth.statusCode !== 401) fail(`no key still 401: ${unauth.statusCode}`);
    else console.log("OK   no API key → 401");

    const adminPositions = await app.inject({
      method: "GET",
      url: "/v1/fleet/positions",
      headers: adminHeaders,
    });
    if (adminPositions.statusCode !== 200 && adminPositions.statusCode !== 500) {
      fail(`admin still reads fleet positions: ${adminPositions.statusCode}`);
    } else {
      console.log(`OK   admin/operator data routes remain available (${adminPositions.statusCode})`);
    }

    const allowed = await app.inject({
      method: "GET",
      url: "/v1/fleet/summary",
      headers: clientHeaders,
    });
    if (allowed.statusCode !== 200 && allowed.statusCode !== 500) {
      fail(`fleet summary should remain allowed: ${allowed.statusCode} ${allowed.body}`);
    } else {
      console.log(`OK   enabled Fleet Overview → /v1/fleet/summary ${allowed.statusCode}`);
    }

    const deniedRest = [
      "/v1/fleet/positions",
      "/v1/events",
      "/v1/media/recent",
      "/v1/devices/MOCKSN/telemetry/latest",
      "/v1/devices/MOCKSN/live-stream",
    ];
    for (const path of deniedRest) {
      const res = await app.inject({
        method: "GET",
        url: path,
        headers: clientHeaders,
      });
      const body = res.json() as { error?: string; message?: string };
      if (res.statusCode !== 403 || body.error !== "forbidden") {
        fail(`${path} expected 403 forbidden, got ${res.statusCode} ${res.body}`);
      } else {
        console.log(`OK   disabled permission → ${path} 403`);
      }
    }

    const deniedIntegration = await app.inject({
      method: "GET",
      url: "/v1/platform/integration/gps-location",
      headers: integrationHeaders,
    });
    if (deniedIntegration.statusCode !== 403) {
      fail(`integration GPS expected 403 got ${deniedIntegration.statusCode} ${deniedIntegration.body}`);
    } else {
      console.log("OK   disabled GPS → /v1/platform/integration/gps-location 403");
    }

    const allowedIntegration = await app.inject({
      method: "GET",
      url: "/v1/platform/integration/fleet",
      headers: integrationHeaders,
    });
    if (allowedIntegration.statusCode !== 200 && allowedIntegration.statusCode !== 500) {
      fail(`integration fleet should remain allowed: ${allowedIntegration.statusCode}`);
    } else {
      console.log(`OK   enabled Fleet Overview → integration fleet ${allowedIntegration.statusCode}`);
    }

    const devices = await app.inject({
      method: "GET",
      url: "/v1/devices",
      headers: clientHeaders,
    });
    if (devices.statusCode !== 200 && devices.statusCode !== 500) {
      fail(`device list should remain allowed: ${devices.statusCode}`);
    } else if (devices.statusCode === 200) {
      const sn = (devices.json().data as Array<{ serialNumber?: string }>)?.[0]?.serialNumber;
      if (sn) {
        const detail = await app.inject({
          method: "GET",
          url: `/v1/devices/${encodeURIComponent(sn)}`,
          headers: clientHeaders,
        });
        const payload = detail.json() as { data?: { stateSummary?: unknown } };
        if (detail.statusCode !== 200) {
          fail(`device detail identity should remain allowed: ${detail.statusCode}`);
        } else if (payload.data?.stateSummary != null) {
          fail("device detail leaked telemetry while drone/dock telemetry is off");
        } else {
          console.log("OK   device detail hides telemetry when toggles are off");
        }
      }
    }

    const enableGps = await app.inject({
      method: "PATCH",
      url: "/v1/platform/admin/integration-accounts/clientaccount/access",
      headers: adminHeaders,
      payload: { gpsLocation: true },
    });
    if (enableGps.statusCode !== 200) fail("re-enable GPS");
    const positionsOn = await app.inject({
      method: "GET",
      url: "/v1/fleet/positions",
      headers: clientHeaders,
    });
    if (positionsOn.statusCode !== 200 && positionsOn.statusCode !== 500) {
      fail(`GPS enabled should allow /v1/fleet/positions: ${positionsOn.statusCode}`);
    } else {
      console.log(`OK   admin enabled GPS → /v1/fleet/positions ${positionsOn.statusCode}`);
    }

    if (failed === 0) {
      console.log("PASS client account data permissions");
    } else {
      console.error(`FAILED ${failed} test(s)`);
      process.exitCode = 1;
    }
  } finally {
    await app.close();
    for (const [key, filePath] of Object.entries(paths) as Array<
      [keyof typeof paths, string]
    >) {
      const backup = backups[key];
      if (backup !== null) writeFileSync(filePath, backup, "utf8");
      else if (existsSync(filePath) && key !== "env") rmSync(filePath);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
