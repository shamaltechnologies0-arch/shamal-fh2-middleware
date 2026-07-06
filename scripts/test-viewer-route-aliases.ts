/**
 * Verifies Shamal Platform viewer API routes and auth boundaries.
 * Usage: npm run test:viewer-routes
 */
async function main(): Promise<void> {
  process.env.VIEWER_API_KEYS = "alias-test-viewer,alias-test-operator";
  process.env.VIEWER_API_KEY_ROLES = "alias-test-viewer:viewer,alias-test-operator:operator";
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

  const routes = [
    "/v1/viewer/devices",
    "/v1/viewer/capabilities",
    "/v1/viewer/fleet/summary",
    "/v1/viewer/fleet/positions",
    "/v1/viewer/docks",
    "/v1/viewer/tasks",
    "/v1/viewer/events",
  ];

  for (const path of routes) {
    const res = await app.inject({
      method: "GET",
      url: path,
      headers: { "x-api-key": API_KEY },
    });
    if (res.statusCode !== 200 && res.statusCode !== 500) {
      failed += 1;
      console.error(`FAIL ${path}: expected 200 or 500 got ${res.statusCode}`);
    } else {
      console.log(`OK   ${path}: ${res.statusCode}`);
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

  const adminBlocked = await app.inject({
    method: "GET",
    url: "/v1/platform/admin/integration-accounts",
    headers: { "x-api-key": API_KEY },
  });
  if (adminBlocked.statusCode !== 403) {
    failed += 1;
    console.error(`FAIL admin-blocked: expected 403 got ${adminBlocked.statusCode}`);
  } else {
    console.log("OK   admin-blocked: operator cannot list integration accounts");
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

  const viewerOpsBlocked = await app.inject({
    method: "GET",
    url: "/v1/platform/ops/catalog",
    headers: { "x-api-key": VIEWER_KEY },
  });
  if (viewerOpsBlocked.statusCode !== 403) {
    failed += 1;
    console.error(`FAIL viewer-ops-blocked: expected 403 got ${viewerOpsBlocked.statusCode}`);
  } else {
    console.log("OK   viewer-ops-blocked: viewer role cannot access ops");
  }

  const unknownPrefix = await app.inject({
    method: "GET",
    url: "/v1/unknown-integrator/devices",
    headers: { "x-api-key": API_KEY },
  });
  if (unknownPrefix.statusCode !== 404) {
    failed += 1;
    console.error(
      `FAIL unknown-prefix: unregistered integrator paths should 404 got ${unknownPrefix.statusCode}`,
    );
  } else {
    console.log("OK   unknown-prefix: unregistered /v1/* integrator paths return 404");
  }

  await app.close();

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll viewer route tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
