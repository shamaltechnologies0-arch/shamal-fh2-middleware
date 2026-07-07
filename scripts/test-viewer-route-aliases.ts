/**
 * Verifies Shamal Platform integration API routes, docs split, and auth boundaries.
 * Usage: npm run test:viewer-routes
 */
async function main(): Promise<void> {
  process.env.VIEWER_API_KEYS =
    "alias-test-viewer,alias-test-operator,alias-test-admin";
  process.env.VIEWER_API_KEY_ROLES =
    "alias-test-viewer:viewer,alias-test-operator:operator,alias-test-admin:admin";
  process.env.CC_USERS = "";

  const { buildServer } = await import("../src/app.js");
  const { roleFromApiKey } = await import("../src/services/commandCenterAuth.js");
  const { findSecretLeaks } = await import("../src/services/openApiDocuments.js");

  const API_KEY = "alias-test-operator";
  const VIEWER_KEY = "alias-test-viewer";
  const ADMIN_KEY = "alias-test-admin";

  if (roleFromApiKey(VIEWER_KEY) !== "viewer") {
    throw new Error("Test setup failed: viewer key must map to viewer role");
  }
  if (roleFromApiKey(ADMIN_KEY) !== "admin") {
    throw new Error("Test setup failed: admin key must map to admin role");
  }

  const app = await buildServer();
  await app.ready();

  let failed = 0;

  const routePairs: Array<{ canonical: string; legacy: string }> = [
    { canonical: "/v1/devices", legacy: "/v1/viewer/devices" },
    { canonical: "/v1/capabilities", legacy: "/v1/viewer/capabilities" },
    { canonical: "/v1/fleet/summary", legacy: "/v1/viewer/fleet/summary" },
    { canonical: "/v1/fleet/positions", legacy: "/v1/viewer/fleet/positions" },
    { canonical: "/v1/docks", legacy: "/v1/viewer/docks" },
    { canonical: "/v1/tasks", legacy: "/v1/viewer/tasks" },
    { canonical: "/v1/events", legacy: "/v1/viewer/events" },
  ];

  for (const { canonical, legacy } of routePairs) {
    for (const path of [canonical, legacy]) {
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

    const legacyRes = await app.inject({
      method: "GET",
      url: legacy,
      headers: { "x-api-key": API_KEY },
    });
    if (legacyRes.headers.deprecation !== "true") {
      failed += 1;
      console.error(`FAIL ${legacy}: expected Deprecation header`);
    } else {
      console.log(`OK   ${legacy}: Deprecation header present`);
    }
  }

  const noKey = await app.inject({ method: "GET", url: "/v1/devices" });
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

  const legacyStillWorks = await app.inject({
    method: "GET",
    url: "/v1/viewer/devices",
    headers: { "x-api-key": API_KEY },
  });
  if (legacyStillWorks.statusCode !== 200 && legacyStillWorks.statusCode !== 500) {
    failed += 1;
    console.error(
      `FAIL legacy-runtime: /v1/viewer/devices should still work got ${legacyStillWorks.statusCode}`,
    );
  } else {
    console.log(`OK   legacy-runtime: /v1/viewer/devices still responds (${legacyStillWorks.statusCode})`);
  }

  const openApiRes = await app.inject({ method: "GET", url: "/openapi.json" });
  if (openApiRes.statusCode !== 200) {
    failed += 1;
    console.error(`FAIL openapi-json: expected 200 got ${openApiRes.statusCode}`);
  } else {
    const openApi = openApiRes.json() as { paths?: Record<string, unknown> };
    const paths = Object.keys(openApi.paths ?? {});
    const viewerPaths = paths.filter((path) => path.startsWith("/v1/viewer"));
    if (viewerPaths.length > 0) {
      failed += 1;
      console.error(
        `FAIL openapi-json: found legacy viewer paths in public spec: ${viewerPaths.join(", ")}`,
      );
    } else {
      console.log("OK   openapi-json: no /v1/viewer paths in published spec");
    }

    if (!paths.includes("/v1/devices")) {
      failed += 1;
      console.error("FAIL openapi-json: canonical /v1/devices missing from published spec");
    } else {
      console.log("OK   openapi-json: canonical /v1/devices documented");
    }
  }

  const yamlRes = await app.inject({ method: "GET", url: "/openapi.yaml" });
  if (yamlRes.statusCode !== 200) {
    failed += 1;
    console.error(`FAIL openapi-yaml: expected 200 got ${yamlRes.statusCode}`);
  } else if (yamlRes.payload.includes("/v1/viewer/")) {
    failed += 1;
    console.error("FAIL openapi-yaml: static spec still contains /v1/viewer paths");
  } else {
    console.log("OK   openapi-yaml: static spec excludes /v1/viewer paths");
  }

  const docsPageRes = await app.inject({ method: "GET", url: "/docs" });
  if (docsPageRes.statusCode !== 200) {
    failed += 1;
    console.error(`FAIL docs-page: expected 200 got ${docsPageRes.statusCode}`);
  } else {
    console.log("OK   docs-page: /docs loads");
  }

  const docsJsonRes = await app.inject({ method: "GET", url: "/docs/json" });
  if (docsJsonRes.statusCode !== 200) {
    failed += 1;
    console.error(`FAIL docs-json: expected 200 got ${docsJsonRes.statusCode}`);
  } else {
    const docsSpec = docsJsonRes.json() as {
      info?: { title?: string };
      paths?: Record<string, unknown>;
    };
    const docsPaths = Object.keys(docsSpec.paths ?? {});
    const docsViewerPaths = docsPaths.filter((path) => path.startsWith("/v1/viewer"));
    const docsAdminPaths = docsPaths.filter((path) =>
      path.startsWith("/v1/platform/admin"),
    );

    if (docsSpec.info?.title !== "Shamal Platform Integration API") {
      failed += 1;
      console.error(`FAIL docs-json: unexpected title ${docsSpec.info?.title}`);
    } else {
      console.log("OK   docs-json: public integration title");
    }

    if (docsViewerPaths.length > 0) {
      failed += 1;
      console.error(
        `FAIL docs-json: Swagger UI spec exposes legacy viewer paths: ${docsViewerPaths.join(", ")}`,
      );
    } else {
      console.log("OK   docs-json: excludes /v1/viewer paths");
    }

    if (docsAdminPaths.length > 0) {
      failed += 1;
      console.error(
        `FAIL docs-json: public docs expose admin routes: ${docsAdminPaths.join(", ")}`,
      );
    } else {
      console.log("OK   docs-json: excludes /v1/platform/admin/*");
    }

    if (!docsPaths.includes("/v1/devices")) {
      failed += 1;
      console.error("FAIL docs-json: missing canonical /v1/devices");
    } else {
      console.log("OK   docs-json: includes /v1/devices");
    }

    if (!docsPaths.includes("/v1/platform/integration/fleet")) {
      failed += 1;
      console.error("FAIL docs-json: missing /v1/platform/integration/fleet");
    } else {
      console.log("OK   docs-json: includes integration routes");
    }

    const publicSecretLeaks = findSecretLeaks(docsSpec);
    if (publicSecretLeaks.length > 0) {
      failed += 1;
      console.error(`FAIL docs-json: secret-like values detected: ${publicSecretLeaks.join(", ")}`);
    } else {
      console.log("OK   docs-json: no secret-like values in schema");
    }
  }

  const adminDocsUnauth = await app.inject({ method: "GET", url: "/admin-docs/json" });
  if (adminDocsUnauth.statusCode !== 401) {
    failed += 1;
    console.error(`FAIL admin-docs-unauth: expected 401 got ${adminDocsUnauth.statusCode}`);
  } else {
    console.log("OK   admin-docs-unauth: /admin-docs/json rejects unauthenticated");
  }

  const adminDocsOperator = await app.inject({
    method: "GET",
    url: "/admin-docs/json",
    headers: { "x-api-key": API_KEY },
  });
  if (adminDocsOperator.statusCode !== 403) {
    failed += 1;
    console.error(`FAIL admin-docs-operator: expected 403 got ${adminDocsOperator.statusCode}`);
  } else {
    console.log("OK   admin-docs-operator: non-admin users forbidden");
  }

  const adminDocsJsonRes = await app.inject({
    method: "GET",
    url: "/admin-docs/json",
    headers: { "x-api-key": ADMIN_KEY },
  });
  if (adminDocsJsonRes.statusCode !== 200) {
    failed += 1;
    console.error(`FAIL admin-docs-json: expected 200 got ${adminDocsJsonRes.statusCode}`);
  } else {
    const adminSpec = adminDocsJsonRes.json() as {
      info?: { title?: string };
      paths?: Record<string, unknown>;
    };
    const adminPaths = Object.keys(adminSpec.paths ?? {});
    const adminOnlyPaths = adminPaths.filter((path) =>
      path.startsWith("/v1/platform/admin"),
    );

    if (adminSpec.info?.title !== "Shamal Platform Admin API") {
      failed += 1;
      console.error(`FAIL admin-docs-json: unexpected title ${adminSpec.info?.title}`);
    } else {
      console.log("OK   admin-docs-json: admin API title");
    }

    if (adminOnlyPaths.length === 0) {
      failed += 1;
      console.error("FAIL admin-docs-json: missing /v1/platform/admin/* routes");
    } else {
      console.log(`OK   admin-docs-json: includes ${adminOnlyPaths.length} admin routes`);
    }

    if (!adminPaths.includes("/v1/devices")) {
      failed += 1;
      console.error("FAIL admin-docs-json: missing public /v1/devices route");
    } else {
      console.log("OK   admin-docs-json: includes public integration routes");
    }

    const adminSecretLeaks = findSecretLeaks(adminSpec);
    if (adminSecretLeaks.length > 0) {
      failed += 1;
      console.error(
        `FAIL admin-docs-json: secret-like values detected: ${adminSecretLeaks.join(", ")}`,
      );
    } else {
      console.log("OK   admin-docs-json: no secret-like values in schema");
    }
  }

  await app.close();

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll integration route tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
