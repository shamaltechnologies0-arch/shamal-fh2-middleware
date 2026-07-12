#!/usr/bin/env node
/**
 * Reorganize repo into apps/api + apps/web DDD structure.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const API_MOVES = [
  ["src/index.ts", "apps/api/src/main.ts"],
  ["src/server.ts", "apps/api/src/server.ts"],
  ["src/bootstrap.ts", "apps/api/src/bootstrap.ts"],
  ["src/app.ts", "apps/api/src/app.ts"],
  ["src/config.ts", "apps/api/src/config/env.ts"],
  ["src/types/fastify.d.ts", "apps/api/src/types/fastify.d.ts"],
  ["src/routes/auth.ts", "apps/api/src/modules/auth/presentation/routes/auth.routes.ts"],
  ["src/services/commandCenterAuth.ts", "apps/api/src/modules/auth/infrastructure/command-center-auth.service.ts"],
  ["src/services/platformSecret.ts", "apps/api/src/modules/auth/infrastructure/platform-secret.service.ts"],
  ["src/utils/sessionCookie.ts", "apps/api/src/modules/auth/shared/session-cookie.ts"],
  ["src/routes/restApiKeys.ts", "apps/api/src/modules/api-keys/presentation/routes/api-keys.routes.ts"],
  ["src/services/restApiKeys.ts", "apps/api/src/modules/api-keys/application/rest-api-keys.service.ts"],
  ["src/services/credentialExpiration.ts", "apps/api/src/modules/api-keys/application/credential-expiration.service.ts"],
  ["src/routes/serviceAccounts.ts", "apps/api/src/modules/service-accounts/presentation/routes/service-accounts.routes.ts"],
  ["src/services/serviceAccounts.ts", "apps/api/src/modules/service-accounts/application/service-accounts.service.ts"],
  ["src/services/serviceAccountCrypto.ts", "apps/api/src/modules/service-accounts/infrastructure/service-account-crypto.ts"],
  ["src/services/viewerUsers.ts", "apps/api/src/modules/users/application/viewer-users.service.ts"],
  ["src/services/viewerDashboardPermissions.ts", "apps/api/src/modules/users/application/viewer-dashboard-permissions.service.ts"],
  ["src/services/fh2Projects.ts", "apps/api/src/modules/projects/application/fh2-projects.service.ts"],
  ["src/services/fh2ProjectContext.ts", "apps/api/src/modules/projects/application/fh2-project-context.ts"],
  ["src/routes/viewerIntegration.ts", "apps/api/src/modules/integrations/presentation/routes/integrations.routes.ts"],
  ["src/services/viewerIntegration.ts", "apps/api/src/modules/integrations/application/viewer-integration.service.ts"],
  ["src/services/viewerScopes.ts", "apps/api/src/modules/integrations/application/viewer-scopes.service.ts"],
  ["src/services/viewerApiData.ts", "apps/api/src/modules/integrations/application/viewer-api-data.service.ts"],
  ["src/routes/admin.ts", "apps/api/src/modules/admin/presentation/routes/admin.routes.ts"],
  ["src/routes/devices.ts", "apps/api/src/modules/devices/presentation/routes/devices.routes.ts"],
  ["src/routes/telemetry-sse.ts", "apps/api/src/modules/devices/presentation/routes/telemetry-sse.routes.ts"],
  ["src/services/deviceCameras.ts", "apps/api/src/modules/devices/application/device-cameras.service.ts"],
  ["src/services/telemetryStore.ts", "apps/api/src/modules/devices/application/telemetry-store.service.ts"],
  ["src/routes/docks.ts", "apps/api/src/modules/docks/presentation/routes/docks.routes.ts"],
  ["src/routes/fleet.ts", "apps/api/src/modules/fleet/presentation/routes/fleet.routes.ts"],
  ["src/routes/tasks.ts", "apps/api/src/modules/tasks/presentation/routes/tasks.routes.ts"],
  ["src/routes/media.ts", "apps/api/src/modules/media/presentation/routes/media.routes.ts"],
  ["src/services/recentMedia.ts", "apps/api/src/modules/media/application/recent-media.service.ts"],
  ["src/routes/events.ts", "apps/api/src/modules/events/presentation/routes/events.routes.ts"],
  ["src/services/viewerEventNotify.ts", "apps/api/src/modules/events/application/viewer-event-notify.service.ts"],
  ["src/routes/webhooks.ts", "apps/api/src/modules/webhooks/presentation/routes/webhooks.routes.ts"],
  ["src/routes/operations.ts", "apps/api/src/modules/operations/presentation/routes/operations.routes.ts"],
  ["src/services/operationsCatalog.ts", "apps/api/src/modules/operations/application/operations-catalog.service.ts"],
  ["src/routes/gis.ts", "apps/api/src/modules/gis/presentation/routes/gis.routes.ts"],
  ["src/services/gis.ts", "apps/api/src/modules/gis/application/gis.service.ts"],
  ["src/routes/streams.ts", "apps/api/src/modules/streams/presentation/routes/streams.routes.ts"],
  ["src/services/liveStream.ts", "apps/api/src/modules/streams/application/live-stream.service.ts"],
  ["src/services/liveStreamInfo.ts", "apps/api/src/modules/streams/application/live-stream-info.service.ts"],
  ["src/routes/mapping.ts", "apps/api/src/modules/mapping/presentation/routes/mapping.routes.ts"],
  ["src/routes/command-center.ts", "apps/api/src/modules/platform/presentation/routes/command-center.routes.ts"],
  ["src/routes/health.ts", "apps/api/src/modules/health/presentation/routes/health.routes.ts"],
  ["src/routes/capabilities.ts", "apps/api/src/modules/capabilities/presentation/routes/capabilities.routes.ts"],
  ["src/routes/viewerPaths.ts", "apps/api/src/shared/http/viewer-paths.ts"],
  ["src/services/apiAccess.ts", "apps/api/src/shared/security/api-access.ts"],
  ["src/services/normalize.ts", "apps/api/src/shared/normalize/normalize.service.ts"],
  ["src/services/openApiDocuments.ts", "apps/api/src/shared/openapi/openapi-documents.service.ts"],
  ["src/db/index.ts", "apps/api/src/infrastructure/database/index.ts"],
  ["src/db/migrate.ts", "apps/api/src/infrastructure/database/migrate.ts"],
  ["src/services/platformDataStore.ts", "apps/api/src/infrastructure/persistence/platform-data-store.ts"],
  ["src/fh2/client.ts", "apps/api/src/infrastructure/fh2/client.ts"],
  ["src/fh2/liveAdapter.ts", "apps/api/src/infrastructure/fh2/live-adapter.ts"],
  ["src/fh2/mockAdapter.ts", "apps/api/src/infrastructure/fh2/mock-adapter.ts"],
  ["src/fh2/types.ts", "apps/api/src/infrastructure/fh2/types.ts"],
  ["src/plugins/auth.ts", "apps/api/src/infrastructure/auth/platform-auth.plugin.ts"],
  ["src/plugins/adminDocsAuth.ts", "apps/api/src/infrastructure/auth/admin-docs-auth.plugin.ts"],
];

const ASSET_MOVES = [
  ["src/ui", "apps/api/src/assets/ui"],
  ["src/logo", "apps/api/src/assets/logo"],
  ["src/bg-image", "apps/api/src/assets/bg-image"],
  ["src/fixtures", "apps/api/src/assets/fixtures"],
];

const OLD_TO_NEW = new Map(API_MOVES.map(([o, n]) => [o.replace(/\.ts$/, ""), n.replace(/\.ts$/, "")]));
const NEW_TO_OLD = new Map(API_MOVES.map(([o, n]) => [n.replace(/\.ts$/, ""), o.replace(/\.ts$/, "")]));

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function movePath(from, to) {
  const absFrom = join(ROOT, from);
  const absTo = join(ROOT, to);
  if (!existsSync(absFrom)) {
    console.warn(`SKIP missing: ${from}`);
    return;
  }
  ensureDir(dirname(absTo));
  if (existsSync(absTo)) rmSync(absTo, { recursive: true, force: true });
  renameSync(absFrom, absTo);
  console.log(`MOVED ${from} -> ${to}`);
}

function walkFiles(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (["node_modules", "dist", ".git"].includes(entry)) continue;
      walkFiles(full, exts, out);
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function toPosix(p) {
  return p.split("\\").join("/");
}

function relImport(fromDir, toFile) {
  let rel = toPosix(relative(fromDir, toFile));
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel.replace(/\.ts$/, ".js");
}

function rewriteImportsInFile(filePath) {
  const newRel = toPosix(relative(ROOT, filePath)).replace(/\.ts$/, "");
  const oldRel = NEW_TO_OLD.get(newRel);
  if (!oldRel) return;

  const oldFile = join(ROOT, oldRel + ".ts");
  const oldDir = dirname(oldFile);
  const newDir = dirname(filePath);

  let content = readFileSync(filePath, "utf-8");
  const original = content;

  content = content.replace(/from\s+["'](\.[^"']+)["']/g, (match, importPath) => {
    const oldTargetAbs = resolve(oldDir, importPath);
    const oldTargetRel = toPosix(relative(ROOT, oldTargetAbs)).replace(/\.js$/, "");
    const mapped = OLD_TO_NEW.get(oldTargetRel);
    if (mapped) {
      const newTargetAbs = join(ROOT, mapped + ".ts");
      return `from "${relImport(newDir, newTargetAbs)}"`;
    }
    // Asset paths: ui, logo, bg-image, fixtures
    if (oldTargetRel.startsWith("src/ui") || oldTargetRel.startsWith("src/logo") ||
        oldTargetRel.startsWith("src/bg-image") || oldTargetRel.startsWith("src/fixtures")) {
      const assetSub = oldTargetRel.replace(/^src\//, "apps/api/src/assets/");
      const newTargetAbs = join(ROOT, assetSub);
      if (existsSync(newTargetAbs) || existsSync(newTargetAbs + ".json")) {
        const ext = importPath.endsWith(".js") ? "" : "";
        const target = existsSync(newTargetAbs) ? newTargetAbs : newTargetAbs;
        return `from "${relImport(newDir, target)}"`;
      }
    }
    return match;
  });

  // Fix join paths for openapi and static assets in command-center
  content = content.replace(
    /join\(\s*dirname\(fileURLToPath\(import\.meta\.url\)\),\s*["']\.\.\/\.\.\/openapi\//g,
    'join(dirname(fileURLToPath(import.meta.url)), "../../../../../openapi/',
  );
  content = content.replace(
    /join\(\s*dirname\(fileURLToPath\(import\.meta\.url\)\),\s*["']\.\.\/openapi\//g,
    'join(dirname(fileURLToPath(import.meta.url)), "../../../../../openapi/',
  );

  // String literal asset paths (non-import)
  const assetReplacements = [
    ["../ui/", relImport(newDir, join(ROOT, "apps/api/src/assets/ui")) + "/"],
    ["../logo/", relImport(newDir, join(ROOT, "apps/api/src/assets/logo")) + "/"],
    ["../bg-image/", relImport(newDir, join(ROOT, "apps/api/src/assets/bg-image")) + "/"],
    ["../fixtures/", relImport(newDir, join(ROOT, "apps/api/src/assets/fixtures")) + "/"],
  ];
  for (const [from, to] of assetReplacements) {
    content = content.split(from).join(to);
  }

  if (content !== original) {
    writeFileSync(filePath, content);
    console.log(`FIXED ${relative(ROOT, filePath)}`);
  }
}

// ── Run migration ──
console.log("\n=== Frontend -> apps/web ===\n");
if (existsSync(join(ROOT, "frontend")) && !existsSync(join(ROOT, "apps/web"))) {
  ensureDir(join(ROOT, "apps"));
  renameSync(join(ROOT, "frontend"), join(ROOT, "apps/web"));
  console.log("MOVED frontend/ -> apps/web/");
}
if (existsSync(join(ROOT, "apps/web/@"))) {
  rmSync(join(ROOT, "apps/web/@"), { recursive: true, force: true });
}

console.log("\n=== Backend -> apps/api/src ===\n");
for (const [from, to] of API_MOVES) movePath(from, to);
for (const [from, to] of ASSET_MOVES) movePath(from, to);
if (existsSync(join(ROOT, "src"))) {
  rmSync(join(ROOT, "src"), { recursive: true, force: true });
}

console.log("\n=== Infrastructure ===\n");
ensureDir(join(ROOT, "infrastructure/docker"));
if (existsSync(join(ROOT, "Dockerfile"))) movePath("Dockerfile", "infrastructure/docker/Dockerfile");
if (existsSync(join(ROOT, "docker-compose.yml"))) movePath("docker-compose.yml", "infrastructure/docker/docker-compose.yml");
ensureDir(join(ROOT, "infrastructure/vercel"));
if (existsSync(join(ROOT, "vercel.json"))) {
  cpSync(join(ROOT, "vercel.json"), join(ROOT, "infrastructure/vercel/vercel.json"));
}

console.log("\n=== Rewriting imports ===\n");
for (const file of walkFiles(join(ROOT, "apps/api/src"), [".ts"])) {
  rewriteImportsInFile(file);
}

const scriptReplacements = [
  ["../src/app.js", "../apps/api/src/app.js"],
  ["../src/db/index.js", "../apps/api/src/infrastructure/database/index.js"],
  ["../src/services/restApiKeys.js", "../apps/api/src/modules/api-keys/application/rest-api-keys.service.js"],
  ["../src/services/commandCenterAuth.js", "../apps/api/src/modules/auth/infrastructure/command-center-auth.service.js"],
  ["../src/services/openApiDocuments.js", "../apps/api/src/shared/openapi/openapi-documents.service.js"],
  ["../src/utils/sessionCookie.js", "../apps/api/src/modules/auth/shared/session-cookie.js"],
];
for (const file of walkFiles(join(ROOT, "scripts"), [".ts"])) {
  let content = readFileSync(file, "utf-8");
  let updated = content;
  for (const [from, to] of scriptReplacements) updated = updated.replaceAll(from, to);
  if (updated !== content) {
    writeFileSync(file, updated);
    console.log(`SCRIPT ${relative(ROOT, file)}`);
  }
}

console.log("\nMigration complete.\n");
