/**
 * Service account management and OAuth token tests.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function main(): Promise<void> {
  process.env.VIEWER_API_KEYS = "sa-test-admin";
  process.env.VIEWER_API_KEY_ROLES = "sa-test-admin:admin";
  process.env.CC_ADMIN_ID = "admin";
  process.env.CC_ADMIN_PASSWORD = "admin1234";
  process.env.FH2_MODE = "mock";
  process.env.FH2_PROJECT_UUID = "550e8400-e29b-41d4-a716-446655440000";

  const usersPath = join(process.cwd(), "data/viewer-users.json");
  const saPath = join(process.cwd(), "data/service-accounts.json");
  const keysPath = join(process.cwd(), "data/viewer-rest-api-keys.json");
  const envPath = join(process.cwd(), ".env");

  const backups = {
    users: existsSync(usersPath) ? readFileSync(usersPath, "utf8") : null,
    sa: existsSync(saPath) ? readFileSync(saPath, "utf8") : null,
    keys: existsSync(keysPath) ? readFileSync(keysPath, "utf8") : null,
    env: existsSync(envPath) ? readFileSync(envPath, "utf8") : null,
  };

  writeFileSync(
    envPath,
    [
      "FH2_MODE=mock",
      "VIEWER_API_KEYS=sa-test-admin",
      "VIEWER_API_KEY_ROLES=sa-test-admin:admin",
      "CC_ADMIN_ID=admin",
      "CC_ADMIN_PASSWORD=admin1234",
      "FH2_PROJECT_UUID=550e8400-e29b-41d4-a716-446655440000",
      "",
    ].join("\n"),
    "utf8",
  );

  for (const p of [usersPath, saPath, keysPath]) {
    if (existsSync(p)) rmSync(p);
  }

  let failed = 0;
  const fail = (message: string) => {
    failed += 1;
    console.error(`FAIL ${message}`);
  };

  const { buildServer } = await import("../src/app.js");
  const app = await buildServer();
  await app.ready();

  const adminHeaders = { "x-api-key": "sa-test-admin", "x-cc-session": "" };

  try {
    const loginAdmin = await app.inject({
      method: "POST",
      url: "/v1/viewer/auth/login",
      payload: { username: "admin", password: "admin1234" },
      headers: { "x-api-key": "sa-test-admin" },
    });
    adminHeaders["x-cc-session"] = loginAdmin.json().data.sessionToken as string;

    const createViewer = await app.inject({
      method: "POST",
      url: "/v1/platform/admin/integration-accounts",
      headers: adminHeaders,
      payload: { username: "clientuser", password: "viewer1234", displayName: "Client User" },
    });
    if (createViewer.statusCode !== 201) fail("create user account");

    const viewerApiKey = createViewer.json().data.apiKey as string;
    const loginViewer = await app.inject({
      method: "POST",
      url: "/v1/viewer/auth/login",
      headers: { "x-api-key": viewerApiKey },
      payload: { username: "clientuser", password: "viewer1234" },
    });
    const viewerHeaders = {
      "x-api-key": viewerApiKey,
      "x-cc-session": loginViewer.json().data.sessionToken as string,
    };

    await app.inject({
      method: "PATCH",
      url: "/v1/platform/admin/integration-accounts/clientuser/access",
      headers: adminHeaders,
      payload: { fleetOverview: true, alertsEvents: true },
    });

    const missingScopes = await app.inject({
      method: "POST",
      url: "/v1/viewer/service-accounts",
      headers: viewerHeaders,
      payload: { name: "App", expiration: "1y" },
    });
    if (missingScopes.statusCode !== 400) fail("service account requires scopes");

    const createSa = await app.inject({
      method: "POST",
      url: "/v1/viewer/service-accounts",
      headers: viewerHeaders,
      payload: {
        name: "ci-cd-deployment-worker",
        description: "Automated worker",
        scopes: ["fleet:read", "events:read"],
        expiration: "1y",
      },
    });
    if (createSa.statusCode !== 201) fail("create service account");
    const sa = createSa.json().data as {
      client_id: string;
      client_secret: string;
    };
    if (!sa.client_id.startsWith("sa_srv_")) fail("client_id prefix sa_srv_");
    if (!sa.client_secret.startsWith("sec_")) fail("client_secret prefix sec_");

    const tokenRes = await app.inject({
      method: "POST",
      url: "/v1/viewer/auth/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: sa.client_id,
        client_secret: sa.client_secret,
      }).toString(),
    });
    if (tokenRes.statusCode !== 200) fail("oauth client_credentials token");
    const accessToken = tokenRes.json().access_token as string;
    if (!accessToken.startsWith("eyJ")) fail("access token is JWT");

    const apiRes = await app.inject({
      method: "GET",
      url: "/v1/viewer/capabilities",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (apiRes.statusCode !== 200) fail("service account JWT accesses API");

    const adminCreate = await app.inject({
      method: "POST",
      url: "/v1/platform/admin/service-accounts",
      headers: adminHeaders,
      payload: {
        ownerUserId: "clientuser",
        name: "admin-created-worker",
        scopes: ["fleet:read"],
        expiration: "6mo",
      },
    });
    if (adminCreate.statusCode !== 201) fail("admin create service account");

    if (failed === 0) {
      console.log("PASS all service account tests");
    } else {
      console.error(`FAILED ${failed} test(s)`);
      process.exitCode = 1;
    }
  } finally {
    await app.close();
    if (backups.users !== null) writeFileSync(usersPath, backups.users, "utf8");
    else if (existsSync(usersPath)) rmSync(usersPath);
    if (backups.sa !== null) writeFileSync(saPath, backups.sa, "utf8");
    else if (existsSync(saPath)) rmSync(saPath);
    if (backups.keys !== null) writeFileSync(keysPath, backups.keys, "utf8");
    else if (existsSync(keysPath)) rmSync(keysPath);
    if (backups.env !== null) writeFileSync(envPath, backups.env, "utf8");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
