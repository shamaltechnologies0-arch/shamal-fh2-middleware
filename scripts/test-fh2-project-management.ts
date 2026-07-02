/**
 * FH2 project management and viewer assignment tests.
 * Usage: npm run test:fh2-projects
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function main(): Promise<void> {
  process.env.VIEWER_API_KEYS = "proj-admin-key,proj-viewer-key";
  process.env.VIEWER_API_KEY_ROLES = "proj-admin-key:admin,proj-viewer-key:viewer";
  process.env.CC_ADMIN_ID = "admin";
  process.env.CC_ADMIN_PASSWORD = "admin1234";
  process.env.FH2_PROJECT_UUID = "550e8400-e29b-41d4-a716-446655440000";

  const usersPath = join(process.cwd(), "data/viewer-users.json");
  const projectsPath = join(process.cwd(), "data/fh2-projects.json");
  const envPath = join(process.cwd(), ".env");

  const usersBackup = existsSync(usersPath) ? readFileSync(usersPath, "utf8") : null;
  const projectsBackup = existsSync(projectsPath) ? readFileSync(projectsPath, "utf8") : null;
  const envBackup = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;

  writeFileSync(
    envPath,
    [
      "FH2_MODE=mock",
      "VIEWER_API_KEYS=proj-admin-key,proj-viewer-key",
      "VIEWER_API_KEY_ROLES=proj-admin-key:admin,proj-viewer-key:viewer",
      "CC_ADMIN_ID=admin",
      "CC_ADMIN_PASSWORD=admin1234",
      "FH2_PROJECT_UUID=550e8400-e29b-41d4-a716-446655440000",
      "",
    ].join("\n"),
    "utf8",
  );

  if (existsSync(usersPath)) rmSync(usersPath);
  if (existsSync(projectsPath)) rmSync(projectsPath);

  const { buildServer } = await import("../src/server.js");
  const app = await buildServer();
  await app.ready();

  let failed = 0;
  const adminHeaders = { "x-api-key": "proj-admin-key", "x-cc-session": "" };

  try {
    const loginAdmin = await app.inject({
      method: "POST",
      url: "/v1/marafiq/auth/login",
      payload: { username: "admin", password: "admin1234" },
      headers: { "x-api-key": "proj-admin-key" },
    });
    if (loginAdmin.statusCode !== 200) {
      throw new Error(`Admin login failed: ${loginAdmin.statusCode} ${loginAdmin.body}`);
    }
    const adminSession = loginAdmin.json().data.sessionToken as string;
    adminHeaders["x-cc-session"] = adminSession;

    const createViewer = await app.inject({
      method: "POST",
      url: "/v1/marafiq/admin/integration-accounts",
      headers: adminHeaders,
      payload: { username: "viewerA", password: "viewer1234", displayName: "Viewer A" },
    });
    if (createViewer.statusCode !== 201) {
      failed += 1;
      console.error("FAIL create viewer");
    }

    const sync1 = await app.inject({
      method: "POST",
      url: "/v1/marafiq/admin/fh2-projects/sync",
      headers: adminHeaders,
      payload: {},
    });
    if (sync1.statusCode !== 200) {
      failed += 1;
      console.error("FAIL admin sync projects");
    }
    const firstProjects = sync1.json().data.projects as Array<{ fh2ProjectId: string }>;
    const projectId = firstProjects[0]?.fh2ProjectId;
    if (!projectId) {
      failed += 1;
      console.error("FAIL synced FH2 project not found");
    }

    const sync2 = await app.inject({
      method: "POST",
      url: "/v1/marafiq/admin/fh2-projects/sync",
      headers: adminHeaders,
      payload: {},
    });
    const secondProjects = sync2.json().data.projects as Array<{ fh2ProjectId: string }>;
    if (new Set(secondProjects.map((p) => p.fh2ProjectId)).size !== secondProjects.length) {
      failed += 1;
      console.error("FAIL duplicate sync created duplicate projects");
    }

    const manualCreateRemoved = await app.inject({
      method: "POST",
      url: "/v1/marafiq/admin/fh2-projects",
      headers: adminHeaders,
      payload: { name: "manual", projectCode: "fake" },
    });
    if (manualCreateRemoved.statusCode === 201 || manualCreateRemoved.statusCode === 200) {
      failed += 1;
      console.error("FAIL manual project creation should not be available");
    }

    const assign = await app.inject({
      method: "POST",
      url: `/v1/marafiq/admin/fh2-projects/${projectId}/assign-viewer`,
      headers: adminHeaders,
      payload: { viewerId: "viewerA" },
    });
    if (assign.statusCode !== 200) {
      failed += 1;
      console.error("FAIL assign viewer to project");
    }

    // Ensure assignment persists after another sync.
    await app.inject({
      method: "POST",
      url: "/v1/marafiq/admin/fh2-projects/sync",
      headers: adminHeaders,
      payload: {},
    });

    const managedViewerApiKey = createViewer.json().data.apiKey as string;
    const loginViewer = await app.inject({
      method: "POST",
      url: "/v1/marafiq/auth/login",
      headers: { "x-api-key": managedViewerApiKey },
      payload: { username: "viewerA", password: "viewer1234" },
    });
    if (loginViewer.statusCode !== 200) {
      failed += 1;
      console.error("FAIL viewer login");
    }
    const viewerSession = loginViewer.json().data.sessionToken as string;
    const viewerHeaders = { "x-api-key": managedViewerApiKey, "x-cc-session": viewerSession };
    const me = await app.inject({ method: "GET", url: "/v1/marafiq/auth/me", headers: viewerHeaders });
    const assignedCode = me.json().data.assignedProjects?.[0]?.projectCode as string | undefined;
    if (!assignedCode) {
      failed += 1;
      console.error("FAIL viewer assignment not preserved after sync");
    }

    const viewerCanReadAssigned = await app.inject({
      method: "GET",
      url: `/v1/marafiq/devices?projectCode=${encodeURIComponent(assignedCode || "")}`,
      headers: viewerHeaders,
    });
    if (viewerCanReadAssigned.statusCode !== 200) {
      failed += 1;
      console.error("FAIL viewer cannot read assigned project");
    }

    const viewerCannotReadOther = await app.inject({
      method: "GET",
      url: "/v1/marafiq/devices?projectCode=550e8400-e29b-41d4-a716-446655440099",
      headers: viewerHeaders,
    });
    if (viewerCannotReadOther.statusCode !== 403) {
      failed += 1;
      console.error("FAIL viewer read unassigned project should be forbidden");
    }

    const viewerCannotAdmin = await app.inject({
      method: "POST",
      url: `/v1/marafiq/admin/fh2-projects/${encodeURIComponent(projectId || "x")}/assign-viewer`,
      headers: viewerHeaders,
      payload: { viewerId: "viewerA" },
    });
    if (viewerCannotAdmin.statusCode !== 403) {
      failed += 1;
      console.error("FAIL viewer should not access admin project APIs");
    }

    const remove = await app.inject({
      method: "DELETE",
      url: `/v1/marafiq/admin/fh2-projects/${projectId}/remove-viewer/viewerA`,
      headers: adminHeaders,
    });
    if (remove.statusCode !== 200) {
      failed += 1;
      console.error("FAIL remove viewer assignment");
    }

    const noAssignedDenied = await app.inject({
      method: "GET",
      url: "/v1/marafiq/devices",
      headers: viewerHeaders,
    });
    if (noAssignedDenied.statusCode !== 403) {
      failed += 1;
      console.error("FAIL viewer without assignment should be denied");
    }

    const fallbackWorks = await app.inject({
      method: "GET",
      url: "/v1/marafiq/fleet/summary",
      headers: adminHeaders,
    });
    if (fallbackWorks.statusCode !== 200) {
      failed += 1;
      console.error("FAIL env fallback project should still work");
    }

    if (failed > 0) {
      console.error(`\n${failed} test(s) failed`);
      process.exit(1);
    }
    console.log("All FH2 project management tests passed");
  } finally {
    await app.close();
    if (usersBackup === null) {
      if (existsSync(usersPath)) rmSync(usersPath);
    } else {
      writeFileSync(usersPath, usersBackup, "utf8");
    }
    if (projectsBackup === null) {
      if (existsSync(projectsPath)) rmSync(projectsPath);
    } else {
      writeFileSync(projectsPath, projectsBackup, "utf8");
    }
    if (envBackup === null) {
      if (existsSync(envPath)) rmSync(envPath);
    } else {
      writeFileSync(envPath, envBackup, "utf8");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
