/**
 * Phase 4 — legacy apiKey deprecation tests.
 * Usage: npm run test:rest-api-keys-phase4
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function main(): Promise<void> {
  const envPath = join(process.cwd(), ".env");
  const usersPath = join(process.cwd(), "data/viewer-users.json");
  const keysPath = join(process.cwd(), "data/viewer-rest-api-keys.json");

  const envBackup = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
  const usersBackup = existsSync(usersPath) ? readFileSync(usersPath, "utf8") : null;
  const keysBackup = existsSync(keysPath) ? readFileSync(keysPath, "utf8") : null;

  writeFileSync(
    envPath,
    [
      "FH2_MODE=mock",
      "VIEWER_API_KEYS=phase4-admin-key",
      "VIEWER_API_KEY_ROLES=phase4-admin-key:admin",
      "CC_ADMIN_ID=admin",
      "CC_ADMIN_PASSWORD=admin1234",
      "FH2_PROJECT_UUID=550e8400-e29b-41d4-a716-446655440000",
      "",
    ].join("\n"),
    "utf8",
  );

  let failed = 0;
  const fail = (message: string) => {
    failed += 1;
    console.error(`FAIL ${message}`);
  };

  try {
    if (existsSync(usersPath)) rmSync(usersPath);
    if (existsSync(keysPath)) rmSync(keysPath);

    const { buildServer } = await import("../apps/api/src/app.js");
    const {
      __resetRestApiKeysMigrationForTests,
      ensureRestApiKeysMigrated,
      verifyRestApiKey,
      userHasRestApiKeys,
    } = await import("../apps/api/src/modules/api-keys/application/rest-api-keys.service.js");

    const app = await buildServer();
    await app.ready();

    const adminLogin = await app.inject({
      method: "POST",
      url: "/v1/viewer/auth/login",
      headers: { "x-api-key": "phase4-admin-key" },
      payload: { username: "admin", password: "admin1234" },
    });
    const adminHeaders = {
      "x-api-key": "phase4-admin-key",
      "x-cc-session": adminLogin.json().data.sessionToken as string,
    };

    const createViewer = await app.inject({
      method: "POST",
      url: "/v1/platform/admin/integration-accounts",
      headers: adminHeaders,
      payload: { username: "newviewer", password: "viewer1234", displayName: "New Viewer" },
    });
    if (createViewer.statusCode !== 201) fail("create viewer account");
    const createData = createViewer.json().data as {
      apiKey: string;
      primaryRestApiKeyMasked: string;
    };
    if (!createData.apiKey?.startsWith("vwr_")) fail("create returns initial apiKey once");
    if (!createData.primaryRestApiKeyMasked?.includes("•")) {
      fail("create returns masked primary key");
    }

    const usersJson = JSON.parse(readFileSync(usersPath, "utf8")) as Array<Record<string, unknown>>;
    const stored = usersJson.find((u) => u.username === "newviewer");
    if (!stored) fail("viewer stored in viewer-users.json");
    if ("apiKey" in (stored || {})) {
      fail("new viewer must not persist apiKey in viewer-users.json");
    }

    if (!verifyRestApiKey(createData.apiKey)) fail("new viewer key authenticates");

    const profile = await app.inject({
      method: "POST",
      url: "/v1/viewer/auth/login",
      headers: { "x-api-key": createData.apiKey },
      payload: { username: "newviewer", password: "viewer1234" },
    });
    const viewerSession = profile.json().data.sessionToken as string;
    const viewerHeaders = {
      "x-api-key": createData.apiKey,
      "x-cc-session": viewerSession,
    };

    const integrationProfile = await app.inject({
      method: "GET",
      url: "/v1/platform/integration/profile",
      headers: viewerHeaders,
    });
    const profileData = integrationProfile.json().data as {
      platformApiKey: string | null;
      primaryRestApiKeyMasked: string | null;
    };
    if (profileData.platformApiKey && !profileData.platformApiKey.includes("•")) {
      fail("integration profile must not return plaintext platformApiKey");
    }
    if (!profileData.primaryRestApiKeyMasked?.includes("•")) {
      fail("integration profile returns masked primaryRestApiKeyMasked");
    }
    if (profileData.platformApiKey !== profileData.primaryRestApiKeyMasked) {
      fail("platformApiKey should equal masked primary for backward compatibility");
    }

    await app.close();

    // Legacy migration scenario (fresh process state)
    const legacyKey = "vwr_legacy0000000000000001";
    writeFileSync(
      usersPath,
      JSON.stringify(
        [
          {
            username: "legacyuser",
            password: "legacy1234",
            displayName: "Legacy User",
            apiKey: legacyKey,
          },
        ],
        null,
        2,
      ) + "\n",
      "utf8",
    );
    if (existsSync(keysPath)) rmSync(keysPath);

    __resetRestApiKeysMigrationForTests();
    ensureRestApiKeysMigrated();
    if (!userHasRestApiKeys("legacyuser")) fail("legacy user migrates to restApiKeys");
    if (!verifyRestApiKey(legacyKey)) fail("migrated legacy key authenticates");

    const keysAfterFirst = JSON.parse(readFileSync(keysPath, "utf8")) as unknown[];
    __resetRestApiKeysMigrationForTests();
    ensureRestApiKeysMigrated();
    const keysAfterSecond = JSON.parse(readFileSync(keysPath, "utf8")) as unknown[];
    if (keysAfterFirst.length !== keysAfterSecond.length) {
      fail("migration is idempotent and does not duplicate keys");
    }

    const app2 = await buildServer();
    await app2.ready();
    const headlessAuth = await app2.inject({
      method: "GET",
      url: "/v1/viewer/capabilities",
      headers: { "x-api-key": legacyKey },
    });
    if (headlessAuth.statusCode !== 200) {
      fail("migrated legacy key works for headless API auth");
    }

    const legacyLogin = await app2.inject({
      method: "POST",
      url: "/v1/viewer/auth/login",
      headers: { "x-api-key": legacyKey },
      payload: { username: "legacyuser", password: "legacy1234" },
    });
    if (legacyLogin.statusCode !== 200) fail("legacy user login after migration");

    const legacyViewerHeaders = {
      "x-api-key": legacyKey,
      "x-cc-session": legacyLogin.json().data.sessionToken as string,
    };
    const createSecond = await app2.inject({
      method: "POST",
      url: "/v1/viewer/rest-api-keys",
      headers: legacyViewerHeaders,
      payload: { label: "Secondary", expiration: "1mo" },
    });
    const secondKey = createSecond.json().data.apiKey as string;
    const disableSecond = await app2.inject({
      method: "PATCH",
      url: `/v1/viewer/rest-api-keys/${encodeURIComponent(createSecond.json().data.id)}`,
      headers: legacyViewerHeaders,
      payload: { status: "disabled" },
    });
    if (disableSecond.statusCode !== 200) fail("disable secondary key");
    if (verifyRestApiKey(secondKey)) fail("disabled key does not authenticate");

    const deleteSecond = await app2.inject({
      method: "DELETE",
      url: `/v1/viewer/rest-api-keys/${encodeURIComponent(createSecond.json().data.id)}`,
      headers: legacyViewerHeaders,
    });
    if (deleteSecond.statusCode !== 200) fail("delete secondary key");
    if (verifyRestApiKey(secondKey)) fail("deleted key does not authenticate");
    if (!verifyRestApiKey(legacyKey)) fail("primary legacy key still works after delete");

    await app2.close();

    if (failed === 0) {
      console.log("PASS all Phase 4 legacy apiKey deprecation tests");
    } else {
      console.error(`FAILED ${failed} test(s)`);
      process.exitCode = 1;
    }
  } finally {
    if (envBackup !== null) writeFileSync(envPath, envBackup, "utf8");
    else if (existsSync(envPath)) rmSync(envPath);
    if (usersBackup !== null) writeFileSync(usersPath, usersBackup, "utf8");
    else if (existsSync(usersPath)) rmSync(usersPath);
    if (keysBackup !== null) writeFileSync(keysPath, keysBackup, "utf8");
    else if (existsSync(keysPath)) rmSync(keysPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
