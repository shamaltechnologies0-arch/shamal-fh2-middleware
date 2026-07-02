/**
 * Verifies /v1/viewer/* route aliases match legacy /v1/marafiq/* responses.
 * Usage: npm run test:viewer-routes
 */
async function main(): Promise<void> {
  process.env.VIEWER_API_KEYS = "alias-test-viewer,alias-test-operator";
  process.env.VIEWER_API_KEY_ROLES = "alias-test-viewer:viewer,alias-test-operator:operator";
  process.env.MARAFIQ_API_KEYS = "";
  process.env.CC_USERS = "";

  const { buildServer } = await import("../src/app.js");
  const { roleFromApiKey } = await import("../src/services/commandCenterAuth.js");

  const API_KEY = "alias-test-operator";
  const VIEWER_KEY = "alias-test-viewer";

  if (roleFromApiKey(VIEWER_KEY) !== "viewer") {
    throw new Error("Test setup failed: viewer key must map to viewer role");
  }

  const app = await buildServer();
  await app.ready();

  let failed = 0;

  const pairTests = [
    { name: "devices", legacyPath: "/v1/marafiq/devices", viewerPath: "/v1/viewer/devices" },
    {
      name: "capabilities",
      legacyPath: "/v1/marafiq/capabilities",
      viewerPath: "/v1/viewer/capabilities",
    },
    {
      name: "fleet-summary",
      legacyPath: "/v1/marafiq/fleet/summary",
      viewerPath: "/v1/viewer/fleet/summary",
    },
    {
      name: "fleet-positions",
      legacyPath: "/v1/marafiq/fleet/positions",
      viewerPath: "/v1/viewer/fleet/positions",
    },
    { name: "docks", legacyPath: "/v1/marafiq/docks", viewerPath: "/v1/viewer/docks" },
    { name: "tasks", legacyPath: "/v1/marafiq/tasks", viewerPath: "/v1/viewer/tasks" },
    { name: "events", legacyPath: "/v1/marafiq/events", viewerPath: "/v1/viewer/events" },
  ];

  for (const test of pairTests) {
    const headers = { "x-api-key": API_KEY };
    const legacy = await app.inject({ method: "GET", url: test.legacyPath, headers });
    const viewer = await app.inject({ method: "GET", url: test.viewerPath, headers });

    const sameStatus = legacy.statusCode === viewer.statusCode;
    const normalizeBody = (body: unknown): unknown => {
      const clone = JSON.parse(JSON.stringify(body)) as {
        data?: Array<Record<string, unknown>>;
      };
      if (Array.isArray(clone.data)) {
        for (const item of clone.data) {
          delete item.capturedAt;
        }
      }
      return clone;
    };
    const sameBody =
      JSON.stringify(normalizeBody(legacy.json())) ===
      JSON.stringify(normalizeBody(viewer.json()));

    if (!sameStatus || !sameBody) {
      failed += 1;
      console.error(
        `FAIL ${test.name}: legacy=${legacy.statusCode} viewer=${viewer.statusCode} bodyMatch=${sameBody}`,
      );
    } else {
      console.log(`OK   ${test.name}: ${legacy.statusCode}`);
    }
  }

  const noKey = await app.inject({ method: "GET", url: "/v1/viewer/devices" });
  if (noKey.statusCode !== 401) {
    failed += 1;
    console.error(`FAIL auth-required: expected 401 got ${noKey.statusCode}`);
  } else {
    console.log("OK   auth-required: 401 without API key");
  }

  const badKey = await app.inject({
    method: "GET",
    url: "/v1/viewer/devices",
    headers: { "x-api-key": "invalid-key" },
  });
  if (badKey.statusCode !== 401) {
    failed += 1;
    console.error(`FAIL bad-key: expected 401 got ${badKey.statusCode}`);
  } else {
    console.log("OK   bad-key: 401 with invalid API key");
  }

  const legacyStillWorks = await app.inject({
    method: "GET",
    url: "/v1/marafiq/devices",
    headers: { "x-api-key": API_KEY },
  });
  if (legacyStillWorks.statusCode !== 200) {
    failed += 1;
    console.error(`FAIL legacy-marafiq: expected 200 got ${legacyStillWorks.statusCode}`);
  } else {
    console.log("OK   legacy-marafiq: /v1/marafiq/devices still works");
  }

  const adminNotExposed = await app.inject({
    method: "GET",
    url: "/v1/viewer/admin/integration-accounts",
    headers: { "x-api-key": API_KEY },
  });
  if (adminNotExposed.statusCode !== 404 && adminNotExposed.statusCode !== 403) {
    failed += 1;
    console.error(
      `FAIL admin-not-exposed: expected 404 or 403 got ${adminNotExposed.statusCode}`,
    );
  } else {
    console.log("OK   admin-not-exposed: /v1/viewer/admin/* not available to operator");
  }

  const opsNotExposed = await app.inject({
    method: "GET",
    url: "/v1/viewer/ops/catalog",
    headers: { "x-api-key": API_KEY },
  });
  if (opsNotExposed.statusCode !== 404) {
    failed += 1;
    console.error(`FAIL ops-not-exposed: expected 404 got ${opsNotExposed.statusCode}`);
  } else {
    console.log("OK   ops-not-exposed: /v1/viewer/ops/* not registered");
  }

  const viewerRoleRead = await app.inject({
    method: "GET",
    url: "/v1/viewer/capabilities",
    headers: { "x-api-key": VIEWER_KEY },
  });
  if (viewerRoleRead.statusCode !== 200) {
    failed += 1;
    console.error(`FAIL viewer-role-read: expected 200 got ${viewerRoleRead.statusCode}`);
  } else {
    console.log("OK   viewer-role-read: viewer API key can read capabilities");
  }

  const viewerOpsBlocked = await app.inject({
    method: "GET",
    url: "/v1/marafiq/ops/catalog",
    headers: { "x-api-key": VIEWER_KEY },
  });
  if (viewerOpsBlocked.statusCode !== 403) {
    failed += 1;
    console.error(`FAIL viewer-ops-blocked: expected 403 got ${viewerOpsBlocked.statusCode}`);
  } else {
    console.log("OK   viewer-ops-blocked: viewer role cannot access ops");
  }

  await app.close();

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll viewer route alias tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
