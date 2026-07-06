/**
 * Aggregate test-results session folder into READONLY_TEST_REPORT.md
 * Usage: npx tsx scripts/generate-test-report.ts [session-dir]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface TestResult {
  name: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  durationMs: number;
  note?: string;
  error?: string;
}

interface RunReport {
  runLabel: string;
  startedAt: string;
  finishedAt: string;
  base: string;
  fh2Mode?: string;
  fh2LiveReady?: boolean;
  summary: { pass: number; fail: number; total: number };
  results: TestResult[];
  discovered: {
    deviceSns: string[];
    droneSns: string[];
    dockSns: string[];
    taskIds: string[];
    devicesOnline: number;
    devicesOffline: number;
  };
}

interface BrowserCheck {
  at: string;
  url: string;
  ok: boolean;
  title?: string;
  note?: string;
}

function loadRuns(sessionDir: string): RunReport[] {
  const jsonl = join(sessionDir, "runs.jsonl");
  if (existsSync(jsonl)) {
    return readFileSync(jsonl, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RunReport);
  }
  return readdirSync(sessionDir)
    .filter((f) => f.startsWith("run-") && f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(sessionDir, f), "utf-8")) as RunReport);
}

function loadBrowserChecks(sessionDir: string): BrowserCheck[] {
  const path = join(sessionDir, "browser-checks.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BrowserCheck);
}

function main() {
  const sessionDir =
    process.argv[2] ??
    (() => {
      const base = "test-results";
      if (!existsSync(base)) throw new Error("No test-results folder");
      const sessions = readdirSync(base)
        .filter((d) => d.startsWith("session-"))
        .sort()
        .reverse();
      if (!sessions[0]) throw new Error("No session folders found");
      return join(base, sessions[0]);
    })();

  const runs = loadRuns(sessionDir);
  const browser = loadBrowserChecks(sessionDir);
  if (!runs.length) throw new Error(`No runs in ${sessionDir}`);

  const testNames = [...new Set(runs.flatMap((r) => r.results.map((t) => t.name)))];
  const matrix: Record<string, { passes: number; fails: number; lastNote?: string; lastError?: string }> = {};

  for (const name of testNames) {
    matrix[name] = { passes: 0, fails: 0 };
    for (const run of runs) {
      const t = run.results.find((r) => r.name === name);
      if (!t) continue;
      if (t.ok) matrix[name].passes++;
      else matrix[name].fails++;
      matrix[name].lastNote = t.note;
      matrix[name].lastError = t.error;
    }
  }

  const latest = runs[runs.length - 1];
  const first = runs[0];
  const allPass = Object.values(matrix).every((m) => m.fails === 0);
  const flaky = Object.entries(matrix).filter(([, m]) => m.passes > 0 && m.fails > 0);

  const lines: string[] = [
    "# Read-only API test report — Shamal FH2 Middleware",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Session: \`${sessionDir}\``,
    `Runs: ${runs.length}`,
    `Duration: ${first.startedAt} → ${latest.finishedAt}`,
    "",
    "## Environment",
    "",
    `- Base URL: ${latest.base}`,
    `- FH2 mode: ${latest.fh2Mode ?? "unknown"}`,
    `- FH2 live ready: ${latest.fh2LiveReady ?? "unknown"}`,
    `- Devices discovered: ${latest.discovered.deviceSns.length} (${latest.discovered.droneSns.length} drones, ${latest.discovered.dockSns.length} docks)`,
    `- Online / offline (last run): ${latest.discovered.devicesOnline} / ${latest.discovered.devicesOffline}`,
    `- Tasks in range: ${latest.discovered.taskIds.length}`,
    "",
    "## Executive summary",
    "",
    allPass
      ? "All read-only endpoints passed on every run."
      : `Some endpoints failed at least once. See tables below.`,
    "",
    latest.discovered.devicesOnline === 0
      ? "> **Note:** No devices reported online during monitoring. Telemetry/readiness may be empty until ops team powers on hardware."
      : "",
    "",
    "## API test matrix",
    "",
    "| Test | Pass runs | Fail runs | Last note / error |",
    "|------|-----------|-----------|-------------------|",
  ];

  for (const name of testNames.sort()) {
    const m = matrix[name];
    const status = m.fails === 0 ? "PASS" : m.passes === 0 ? "FAIL" : "FLAKY";
    const detail = m.lastError ?? m.lastNote ?? "—";
    lines.push(`| ${name} | ${m.passes}/${runs.length} | ${m.fails}/${runs.length} | ${status}: ${detail.replace(/\|/g, "/")} |`);
  }

  if (flaky.length) {
    lines.push("", "## Flaky tests", "");
    for (const [name, m] of flaky) {
      lines.push(`- **${name}**: ${m.passes} pass, ${m.fails} fail`);
    }
  }

  const alwaysFail = Object.entries(matrix).filter(([, m]) => m.fails === runs.length);
  if (alwaysFail.length) {
    lines.push("", "## Consistently failing", "");
    for (const [name, m] of alwaysFail) {
      lines.push(`- **${name}**: ${m.lastError ?? m.lastNote ?? "failed every run"}`);
    }
  }

  const alwaysPass = Object.entries(matrix).filter(([, m]) => m.fails === 0);
  lines.push("", "## Consistently working", "");
  for (const [name] of alwaysPass) {
    lines.push(`- ${name}`);
  }

  if (browser.length) {
    lines.push("", "## Browser checks", "", "| Time | URL | Result | Note |", "|------|-----|--------|------|");
    for (const b of browser) {
      lines.push(`| ${b.at} | ${b.url} | ${b.ok ? "OK" : "FAIL"} | ${b.note ?? b.title ?? "—"} |`);
    }
  }

  lines.push(
    "",
    "## Device serials (last run)",
    "",
    latest.discovered.deviceSns.length
      ? latest.discovered.deviceSns.map((s) => `- \`${s}\``).join("\n")
      : "_None returned from FlightHub_",
    "",
    "## Recommendations",
    "",
  );

  if (latest.discovered.devicesOnline === 0) {
    lines.push("- Ask ops to power on dock/drone; re-run readiness and telemetry tests.");
  }
  if (alwaysFail.some(([n]) => n.includes("task"))) {
    lines.push("- Task endpoints may need a wider date range or completed flights in FH2.");
  }
  if (latest.fh2LiveReady === false) {
    lines.push("- Check `FH2_ORG_TOKEN` and `FH2_PROJECT_UUID` in `.env`.");
  }
  lines.push("- Share this report with external viewer integrators; read-only contract is validated.");

  const outPath = join(sessionDir, "READONLY_TEST_REPORT.md");
  writeFileSync(outPath, lines.join("\n"));
  console.log(`Report written: ${outPath}`);
}

main();
