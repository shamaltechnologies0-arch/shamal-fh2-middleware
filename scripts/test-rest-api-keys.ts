/**
 * REST API key management route tests.
 * Usage: npm run test:rest-api-keys
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function main(): Promise<void> {
  process.env.VIEWER_API_KEYS = "keys-admin-key";
  process.env.VIEWER_API_KEY_ROLES = "keys-admin-key:admin";
  process.env.CC_ADMIN_ID = "admin";
  process.env.CC_ADMIN_PASSWORD = "admin1234";
  process.env.FH2_MODE = "mock";
  process.env.FH2_PROJECT_UUID = "550e8400-e29b-41d4-a716-446655440000";

  const usersPath = join(process.cwd(), "data/viewer-users.json");
  const keysPath = join(process.cwd(), "data/viewer-rest-api-keys.json");
  const envPath = join(process.cwd(), ".env");

  const usersBackup = existsSync(usersPath) ? readFileSync(usersPath, "utf8") : null;
  const keysBackup = existsSync(keysPath) ? readFileSync(keysPath, "utf8") : null;
  const envBackup = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;

  writeFileSync(
    envPath,
    [
      "FH2_MODE=mock",
      "VIEWER_API_KEYS=keys-admin-key",
      "VIEWER_API_KEY_ROLES=keys-admin-key:admin",
      "CC_ADMIN_ID=admin",
      "CC_ADMIN_PASSWORD=admin1234",
      "FH2_PROJECT_UUID=550e8400-e29b-41d4-a716-446655440000",
      "",
    ].join("\n"),
    "utf8",
  );

  if (existsSync(usersPath)) rmSync(usersPath);
  if (existsSync(keysPath)) rmSync(keysPath);

  const { buildServer } = await import("../src/app.js");
  const { verifyRestApiKey } = await import("../src/services/restApiKeys.js");
  const app = await buildServer();
  await app.ready();

  let failed = 0;
  const fail = (message: string) => {
    failed += 1;
    console.error(`FAIL ${message}`);
  };

  const adminHeaders = { "x-api-key": "keys-admin-key", "x-cc-session": "" };

  try {
    const loginAdmin = await app.inject({
      method: "POST",
      url: "/v1/marafiq/auth/login",
      payload: { username: "admin", password: "admin1234" },
      headers: { "x-api-key": "keys-admin-key" },
    });
    if (loginAdmin.statusCode !== 200) {
      throw new Error(`Admin login failed: ${loginAdmin.statusCode} ${loginAdmin.body}`);
    }
    adminHeaders["x-cc-session"] = loginAdmin.json().data.sessionToken as string;

    const createViewerA = await app.inject({
      method: "POST",
      url: "/v1/marafiq/admin/integration-accounts",
      headers: adminHeaders,
      payload: { username: "viewerA", password: "viewer1234", displayName: "Viewer A" },
    });
    const createViewerB = await app.inject({
      method: "POST",
      url: "/v1/marafiq/admin/integration-accounts",
      headers: adminHeaders,
      payload: { username: "viewerB", password: "viewer1234", displayName: "Viewer B" },
    });
    if (createViewerA.statusCode !== 201 || createViewerB.statusCode !== 201) {
      fail("create viewer accounts");
    }

    const viewerAApiKey = createViewerA.json().data.apiKey as string;
    const loginViewerA = await app.inject({
      method: "POST",
      url: "/v1/marafiq/auth/login",
      headers: { "x-api-key": viewerAApiKey },
      payload: { username: "viewerA", password: "viewer1234" },
    });
    const loginViewerB = await app.inject({
      method: "POST",
      url: "/v1/marafiq/auth/login",
      headers: { "x-api-key": createViewerB.json().data.apiKey as string },
      payload: { username: "viewerB", password: "viewer1234" },
    });
    if (loginViewerA.statusCode !== 200 || loginViewerB.statusCode !== 200) {
      fail("viewer login");
    }

    const viewerAHeaders = {
      "x-api-key": viewerAApiKey,
      "x-cc-session": loginViewerA.json().data.sessionToken as string,
    };
    const viewerBHeaders = {
      "x-api-key": createViewerB.json().data.apiKey as string,
      "x-cc-session": loginViewerB.json().data.sessionToken as string,
    };

    const listA = await app.inject({
      method: "GET",
      url: "/v1/marafiq/rest-api-keys",
      headers: viewerAHeaders,
    });
    if (listA.statusCode !== 200) fail("viewer list own keys");
    const listBody = listA.json();
    if (!Array.isArray(listBody.data) || listBody.data.length < 1) {
      fail("viewer list returns keys");
    }
    if (listBody.meta?.maxKeys !== 10) fail("list meta maxKeys");
    if (listBody.data.some((row: { apiKey?: string }) => row.apiKey)) {
      fail("list must not return plaintext apiKey");
    }

    const missingLabel = await app.inject({
      method: "POST",
      url: "/v1/marafiq/rest-api-keys",
      headers: viewerAHeaders,
      payload: {},
    });
    if (missingLabel.statusCode !== 400) fail("missing label returns 400");

    const createKey = await app.inject({
      method: "POST",
      url: "/v1/marafiq/rest-api-keys",
      headers: viewerAHeaders,
      payload: { label: "Staging" },
    });
    if (createKey.statusCode !== 201) fail("viewer create key");
    const created = createKey.json().data as {
      id: string;
      apiKey: string;
      keyMasked: string;
    };
    if (!created.apiKey?.startsWith("vwr_")) fail("create returns plaintext once");
    if (created.apiKey === created.keyMasked) fail("create masked differs from plaintext");

    const listAfterCreate = await app.inject({
      method: "GET",
      url: "/v1/marafiq/rest-api-keys",
      headers: viewerAHeaders,
    });
    if (listAfterCreate.json().data.some((row: { apiKey?: string }) => row.apiKey)) {
      fail("list after create must not return plaintext");
    }

    const crossViewerGet = await app.inject({
      method: "GET",
      url: `/v1/marafiq/rest-api-keys/${encodeURIComponent(created.id)}`,
      headers: viewerBHeaders,
    });
    if (crossViewerGet.statusCode !== 404) {
      fail("viewer cannot access another viewer key");
    }

    const invalidStatus = await app.inject({
      method: "PATCH",
      url: `/v1/marafiq/rest-api-keys/${encodeURIComponent(created.id)}`,
      headers: viewerAHeaders,
      payload: { status: "revoked" },
    });
    if (invalidStatus.statusCode !== 400) fail("invalid status returns 400");

    const disableKey = await app.inject({
      method: "PATCH",
      url: `/v1/marafiq/rest-api-keys/${encodeURIComponent(created.id)}`,
      headers: viewerAHeaders,
      payload: { status: "disabled" },
    });
    if (disableKey.statusCode !== 200) fail("disable key");
    if (verifyRestApiKey(created.apiKey)) fail("disable blocks auth");

    const enableKey = await app.inject({
      method: "PATCH",
      url: `/v1/marafiq/rest-api-keys/${encodeURIComponent(created.id)}`,
      headers: viewerAHeaders,
      payload: { status: "active" },
    });
    if (enableKey.statusCode !== 200) fail("enable key");
    if (!verifyRestApiKey(created.apiKey)) fail("enable restores auth");

    const setPrimary = await app.inject({
      method: "POST",
      url: `/v1/marafiq/rest-api-keys/${encodeURIComponent(created.id)}/set-primary`,
      headers: viewerAHeaders,
      payload: {},
    });
    if (setPrimary.statusCode !== 200) fail("set primary");
    const primaryList = await app.inject({
      method: "GET",
      url: "/v1/marafiq/rest-api-keys",
      headers: viewerAHeaders,
    });
    const primaryRows = primaryList.json().data as Array<{ id: string; isPrimary: boolean }>;
    if (primaryRows.filter((row) => row.isPrimary).length !== 1) {
      fail("set-primary leaves exactly one primary key");
    }
    if (!primaryRows.find((row) => row.isPrimary && row.id === created.id)) {
      fail("set-primary marks requested key as primary");
    }

    const adminList = await app.inject({
      method: "GET",
      url: "/v1/marafiq/admin/integration-accounts/viewerB/rest-api-keys",
      headers: adminHeaders,
    });
    if (adminList.statusCode !== 200) fail("admin list keys for account");

    const adminCreate = await app.inject({
      method: "POST",
      url: "/v1/marafiq/admin/integration-accounts/viewerB/rest-api-keys",
      headers: adminHeaders,
      payload: { label: "Admin Created" },
    });
    if (adminCreate.statusCode !== 201) fail("admin create key");
    const adminCreated = adminCreate.json().data as { id: string; apiKey: string };
    if (!adminCreated.apiKey?.startsWith("vwr_")) fail("admin create returns plaintext once");

    const deleteKey = await app.inject({
      method: "DELETE",
      url: `/v1/marafiq/rest-api-keys/${encodeURIComponent(created.id)}`,
      headers: viewerAHeaders,
    });
    if (deleteKey.statusCode !== 200) fail("delete key");
    if (verifyRestApiKey(created.apiKey)) fail("delete removes auth permanently");

    const adminDelete = await app.inject({
      method: "DELETE",
      url: `/v1/marafiq/admin/integration-accounts/viewerB/rest-api-keys/${encodeURIComponent(adminCreated.id)}`,
      headers: adminHeaders,
    });
    if (adminDelete.statusCode !== 200) fail("admin delete key");
    if (verifyRestApiKey(adminCreated.apiKey)) fail("admin delete removes auth");

    if (failed === 0) {
      console.log("PASS all REST API key route tests");
    } else {
      console.error(`FAILED ${failed} test(s)`);
      process.exitCode = 1;
    }
  } finally {
    await app.close();
    if (usersBackup !== null) writeFileSync(usersPath, usersBackup, "utf8");
    else if (existsSync(usersPath)) rmSync(usersPath);
    if (keysBackup !== null) writeFileSync(keysPath, keysBackup, "utf8");
    else if (existsSync(keysPath)) rmSync(keysPath);
    if (envBackup !== null) writeFileSync(envPath, envBackup, "utf8");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
