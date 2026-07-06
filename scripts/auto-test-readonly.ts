/**
 * Read-only API smoke/regression runner for Shamal FH2 middleware.
 * Usage: npx tsx scripts/auto-test-readonly.ts [--out-dir test-results/session-...]
 */
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:8080";
const KEY = process.env.KEY ?? process.env.VIEWER_API_KEY ?? "viewer-ro-26";
const RUN_LABEL = process.env.RUN_LABEL ?? new Date().toISOString();

interface TestResult {
  name: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  durationMs: number;
  note?: string;
  error?: string;
  sample?: unknown;
}

interface RunReport {
  runLabel: string;
  startedAt: string;
  finishedAt: string;
  base: string;
  fh2Mode?: string;
  fh2LiveReady?: boolean;
  summary: { pass: number; fail: number; skip: number; total: number };
  results: TestResult[];
  discovered: {
    deviceSns: string[];
    droneSns: string[];
    dockSns: string[];
    taskIds: string[];
    mappingModelIds: string[];
    devicesOnline: number;
    devicesOffline: number;
  };
}

async function request(
  method: string,
  path: string,
  opts: { auth?: boolean; accept?: string; timeoutMs?: number } = {},
): Promise<{ status: number; body: unknown; durationMs: number }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.auth !== false) headers["X-Api-Key"] = KEY;
  if (opts.accept) headers.Accept = opts.accept;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  const start = Date.now();

  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, signal: controller.signal });
    const durationMs = Date.now() - start;
    const ct = res.headers.get("content-type") ?? "";
    let body: unknown;
    if (ct.includes("json") || ct.includes("geo+json")) {
      body = await res.json();
    } else if (ct.includes("xml") || ct.includes("kml")) {
      body = { _rawLength: (await res.text()).length };
    } else {
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = { _raw: text.slice(0, 500) };
      }
    }
    return { status: res.status, body, durationMs };
  } finally {
    clearTimeout(timeout);
  }
}

function sampleBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.data)) {
    return { meta: b.meta, dataCount: b.data.length, dataSample: b.data.slice(0, 2) };
  }
  if (b.data && typeof b.data === "object") {
    return { meta: b.meta, data: b.data };
  }
  return body;
}

async function runTest(
  name: string,
  method: string,
  path: string,
  validate: (status: number, body: unknown) => { ok: boolean; note?: string },
  opts?: { auth?: boolean; accept?: string },
): Promise<TestResult> {
  try {
    const { status, body, durationMs } = await request(method, path, opts);
    const { ok, note } = validate(status, body);
    return {
      name,
      method,
      path,
      status,
      ok,
      durationMs,
      note,
      sample: ok ? sampleBody(body) : body,
      error: ok ? undefined : note ?? `HTTP ${status}`,
    };
  } catch (err) {
    return {
      name,
      method,
      path,
      status: 0,
      ok: false,
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const outDir =
    process.argv.find((a) => !a.startsWith("-"))?.startsWith("test-results")
      ? process.argv.find((a) => a.startsWith("test-results"))!
      : process.env.OUT_DIR ?? join("test-results", `session-${RUN_LABEL.replace(/[:.]/g, "-")}`);

  mkdirSync(outDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const results: TestResult[] = [];
  const discovered = {
    deviceSns: [] as string[],
    droneSns: [] as string[],
    dockSns: [] as string[],
    taskIds: [] as string[],
    mappingModelIds: [] as string[],
    devicesOnline: 0,
    devicesOffline: 0,
  };

  // Health (no auth)
  const health = await runTest("health", "GET", "/health", (s, b) => ({
    ok: s === 200 && (b as { status?: string }).status === "ok",
    note: s !== 200 ? "Health check failed" : undefined,
  }), { auth: false });
  results.push(health);

  const healthBody = health.sample as { fh2Mode?: string; fh2LiveReady?: boolean } | undefined;

  // Capabilities
  results.push(
    await runTest("capabilities", "GET", "/v1/viewer/capabilities", (s) => ({
      ok: s === 200,
    })),
  );

  // Fleet summary
  const fleet = await runTest("fleet-summary", "GET", "/v1/viewer/fleet/summary", (s, b) => {
    const data = (b as { data?: { devices?: Array<{ serialNumber: string; role: string; online: boolean | null }> } })
      .data;
    if (data?.devices) {
      for (const d of data.devices) {
        discovered.deviceSns.push(d.serialNumber);
        if (d.role === "drone") discovered.droneSns.push(d.serialNumber);
        if (d.role === "gateway") discovered.dockSns.push(d.serialNumber);
        if (d.online === true) discovered.devicesOnline++;
        if (d.online === false) discovered.devicesOffline++;
      }
    }
    return { ok: s === 200 };
  });
  results.push(fleet);

  // Devices list
  const devices = await runTest("devices-list", "GET", "/v1/viewer/devices", (s, b) => {
    const data = (b as { data?: Array<{ serialNumber: string; role: string; online: boolean | null }> }).data;
    if (data?.length) {
      for (const d of data) {
        if (!discovered.deviceSns.includes(d.serialNumber)) discovered.deviceSns.push(d.serialNumber);
        if (d.role === "drone" && !discovered.droneSns.includes(d.serialNumber))
          discovered.droneSns.push(d.serialNumber);
        if (d.role === "gateway" && !discovered.dockSns.includes(d.serialNumber))
          discovered.dockSns.push(d.serialNumber);
      }
    }
    return { ok: s === 200, note: data?.length ? `${data.length} devices` : "empty fleet" };
  });
  results.push(devices);

  // Docks
  results.push(
    await runTest("docks-list", "GET", "/v1/viewer/docks", (s, b) => {
      const count = (b as { meta?: { count?: number } }).meta?.count ?? 0;
      return { ok: s === 200, note: `${count} docks` };
    }),
  );

  const primaryDrone = discovered.droneSns[0] ?? discovered.deviceSns[0];
  const primaryDock = discovered.dockSns[0];
  const primaryDevice = primaryDrone ?? primaryDock;

  if (primaryDevice) {
    results.push(
      await runTest("device-detail", "GET", `/v1/viewer/devices/${encodeURIComponent(primaryDevice)}`, (s) => ({
        ok: s === 200,
      })),
    );
    results.push(
      await runTest(
        "telemetry-latest",
        "GET",
        `/v1/viewer/devices/${encodeURIComponent(primaryDevice)}/telemetry/latest`,
        (s, b) => {
          const data = (b as { data?: { batteryPercent?: number | null; latitude?: number | null } }).data;
          const hasTelemetry = data && (data.batteryPercent != null || data.latitude != null);
          return {
            ok: s === 200,
            note: hasTelemetry ? "telemetry present" : "device off — empty/stale telemetry expected",
          };
        },
      ),
    );
    results.push(
      await runTest(
        "live-stream-info",
        "GET",
        `/v1/viewer/devices/${encodeURIComponent(primaryDevice)}/live-stream`,
        (s) => ({ ok: s === 200 }),
      ),
    );
    results.push(
      await runTest(
        "ops-readiness",
        "GET",
        `/v1/platform/ops/readiness/${encodeURIComponent(primaryDevice)}`,
        (s, b) => {
          const data = (b as { data?: { commandReady?: boolean; online?: boolean | null } }).data;
          return {
            ok: s === 200,
            note: data
              ? `online=${data.online} commandReady=${data.commandReady}`
              : "readiness snapshot ok",
          };
        },
      ),
    );
  } else {
    results.push({
      name: "device-detail",
      method: "GET",
      path: "/v1/viewer/devices/{sn}",
      status: 0,
      ok: false,
      durationMs: 0,
      error: "skipped — no devices in project",
    });
  }

  if (primaryDock) {
    results.push(
      await runTest("dock-detail", "GET", `/v1/viewer/docks/${encodeURIComponent(primaryDock)}`, (s) => ({
        ok: s === 200,
      })),
    );
  }

  // Tasks
  const tasks = await runTest("tasks-list", "GET", "/v1/viewer/tasks", (s, b) => {
    const data = (b as { data?: Array<{ id: string }> }).data;
    if (data?.length) discovered.taskIds.push(...data.map((t) => t.id));
    return { ok: s === 200, note: data?.length ? `${data.length} tasks` : "no tasks in range" };
  });
  results.push(tasks);

  const taskId = discovered.taskIds[0];
  if (taskId) {
    for (const [name, path] of [
      ["task-detail", `/v1/viewer/tasks/${taskId}`],
      ["task-media", `/v1/viewer/tasks/${taskId}/media`],
      ["task-trajectory", `/v1/viewer/tasks/${taskId}/trajectory`],
      ["trajectory-geojson", `/v1/viewer/tasks/${taskId}/trajectory.geojson`],
      ["trajectory-kml", `/v1/viewer/tasks/${taskId}/trajectory.kml`],
    ] as const) {
      results.push(
        await runTest(name, "GET", path, (s) => ({ ok: s === 200 }), {
          accept: name.includes("geojson")
            ? "application/geo+json"
            : name.includes("kml")
              ? "application/vnd.google-earth.kml+xml"
              : "application/json",
        }),
      );
    }
  }

  // Mapping
  const mapping = await runTest("mapping-models", "GET", "/v1/viewer/mapping/models", (s, b) => {
    const data = (b as { data?: Array<{ id: string }> }).data;
    if (data?.length) discovered.mappingModelIds.push(...data.map((m) => m.id));
    return { ok: s === 200, note: data?.length ? `${data.length} models` : "no models" };
  });
  results.push(mapping);

  if (discovered.mappingModelIds[0]) {
    results.push(
      await runTest(
        "mapping-model-detail",
        "GET",
        `/v1/viewer/mapping/models/${discovered.mappingModelIds[0]}`,
        (s) => ({ ok: s === 200 || s === 404 }),
      ),
    );
  }

  // Events + read-only ops catalog/log
  results.push(
    await runTest("events-list", "GET", "/v1/viewer/events?limit=10", (s) => ({ ok: s === 200 })),
  );
  results.push(
    await runTest("ops-catalog", "GET", "/v1/platform/ops/catalog", (s) => ({ ok: s === 200 })),
  );
  results.push(
    await runTest("ops-log", "GET", "/v1/platform/ops/log?limit=10", (s) => ({ ok: s === 200 })),
  );

  // OpenAPI spec
  results.push(
    await runTest("openapi-yaml", "GET", "/openapi.yaml", (s, b) => ({
      ok: s === 200 && typeof b === "object" && (b as { _raw?: string })._raw?.includes("openapi"),
    }), { auth: false }),
  );

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;

  const report: RunReport = {
    runLabel: RUN_LABEL,
    startedAt,
    finishedAt: new Date().toISOString(),
    base: BASE,
    fh2Mode: healthBody?.fh2Mode,
    fh2LiveReady: healthBody?.fh2LiveReady,
    summary: { pass, fail, skip: 0, total: results.length },
    results,
    discovered,
  };

  const runFile = join(outDir, `run-${RUN_LABEL.replace(/[:.]/g, "-")}.json`);
  writeFileSync(runFile, JSON.stringify(report, null, 2));
  appendFileSync(join(outDir, "runs.jsonl"), `${JSON.stringify(report)}\n`);

  console.log(JSON.stringify({ outDir, runFile, summary: report.summary, discovered: report.discovered }, null, 2));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
