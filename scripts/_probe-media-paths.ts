import { randomUUID } from "node:crypto";
import { config } from "../apps/api/src/config/env.js";
import { LiveFh2Client } from "../apps/api/src/infrastructure/fh2/live-adapter.js";
import { setFh2RequestContext } from "../apps/api/src/modules/projects/application/fh2-project-context.js";

const id = "083c9116-70c6-4dc1-baff-ea4051971e15";

async function probe(path: string, headerName: "X-User-Token" | "x-user-token" = "X-User-Token") {
  const url = new URL(path, config.FH2_BASE_URL);
  const response = await fetch(url, {
    headers: {
      [headerName]: config.FH2_ORG_TOKEN ?? "",
      "X-Request-Id": randomUUID(),
      "X-Language": "en",
      "X-Project-Uuid": id,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let code: number | null = null;
  let message = text.replace(/\s+/g, " ").slice(0, 120);
  try {
    const body = JSON.parse(text) as { code?: number; message?: string; data?: { list?: unknown[] } };
    code = body.code ?? null;
    message = `${body.message ?? ""} list=${Array.isArray(body.data?.list) ? body.data.list.length : "n/a"}`;
  } catch {
    /* plain text */
  }
  console.log(JSON.stringify({ path, headerName, status: response.status, code, message }));
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 3).map(sanitize);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/url|token|signature|credential/i.test(key)) {
      out[key] = item ? "present" : "";
      continue;
    }
    out[key] = sanitize(item);
  }
  return out;
}

async function main() {
  setFh2RequestContext({ projectCode: id });
  const fh2 = new LiveFh2Client();
  const devices = await fh2.listProjectDevices();
  const sn = devices.find((entry) => entry.gateway?.sn)?.gateway?.sn;
  if (!sn) throw new Error("no dock");
  const endAt = Math.floor(Date.now() / 1000);
  const tasks = await fh2.listTasks({ sn, beginAt: endAt - 365 * 24 * 60 * 60, endAt });
  const task = [...tasks].sort((a, b) => {
    return new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime();
  })[0];
  console.log(JSON.stringify({
    taskCount: tasks.length,
    taskKeys: task ? Object.keys(task) : [],
    taskType: task?.task_type ?? null,
    folderId: task?.folder_id ?? null,
    upload: task?.media_upload_status ?? null,
    status: task?.status ?? null,
  }));
  if (!task) return;
  const paths = [
    `/openapi/v0.1/flight-task/${task.uuid}/media`,
    `/media/api/v1/workspaces/${id}/files?page=1&size=5&parent_id=${task.folder_id ?? 0}`,
    `/media/api/v1/files/${id}/files?page=1&page_size=5`,
    `/openapi/v0.1/media/api/v1/workspaces/${id}/files?page=1&size=5&parent_id=${task.folder_id ?? 0}`,
    `/file-storage/api/v1/workspaces/${id}/files?page=1&size=5&parent_id=${task.folder_id ?? 0}`,
  ];
  for (const path of paths) {
    await probe(path);
  }
  await probe(
    `/openapi/v0.9/media/api/v1/workspaces/${id}/files?page=1&size=5&parent_id=${task.folder_id ?? 0}`,
    "x-user-token",
  );

  for (const path of [
    `/media/api/v1/workspaces/${id}/files?page=1&size=20`,
    `/media/api/v1/workspaces/${id}/files?page=1&size=20&parent_id=0`,
    `/media/api/v1/workspaces/${id}/files?page=1&size=3&parent_id=${task.folder_id}`,
  ]) {
    const url = new URL(path, config.FH2_BASE_URL);
    const response = await fetch(url, {
      headers: {
        "X-User-Token": config.FH2_ORG_TOKEN ?? "",
        "X-Request-Id": randomUUID(),
        "X-Language": "en",
        "X-Project-Uuid": id,
        Accept: "application/json",
      },
    });
    const body = (await response.json()) as { data?: unknown };
    console.log(path.split("?")[1], JSON.stringify(sanitize(body.data)).slice(0, 1800));
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message.slice(0, 300) : String(err));
  process.exit(1);
});
