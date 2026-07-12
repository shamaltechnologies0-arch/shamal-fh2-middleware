import type { IFh2Client } from "../../../infrastructure/fh2/types.js";
import {
  normalizeMedia,
  normalizeTask,
  type NormalizedMedia,
  type NormalizedTask,
} from "../../../shared/normalize/normalize.service.js";

export interface TaskMediaBundle {
  task: NormalizedTask;
  media: NormalizedMedia[];
  mediaError: string | null;
  mediaAvailable: boolean;
}

export interface RecentMediaResult {
  tasks: TaskMediaBundle[];
  totalMediaFiles: number;
  mediaApiBlocked: boolean;
}

const MEDIA_PERMISSION_HINT =
  "FlightHub returned error 219021 for task media. Regenerate the Organization Key in FlightHub Sync with Task Management enabled (media read).";

async function safeTaskMedia(
  fh2: IFh2Client,
  taskId: string,
): Promise<{ media: NormalizedMedia[]; error: string | null }> {
  try {
    const raw = await fh2.getTaskMedia(taskId);
    return { media: normalizeMedia(raw), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { media: [], error: message };
  }
}

export async function loadRecentTaskMedia(
  fh2: IFh2Client,
  options: {
    deviceSn: string;
    beginAt: number;
    endAt: number;
    taskLimit?: number;
    mediaPerTask?: number;
    dockLabel?: string;
  },
): Promise<RecentMediaResult> {
  const taskLimit = options.taskLimit ?? 5;
  const mediaPerTask = options.mediaPerTask ?? 12;

  const rawTasks = await fh2.listTasks({
    sn: options.deviceSn,
    beginAt: options.beginAt,
    endAt: options.endAt,
  });

  const sorted = [...rawTasks].sort((a, b) => {
    const ta = new Date(a.completed_at ?? a.begin_at ?? 0).getTime();
    const tb = new Date(b.completed_at ?? b.begin_at ?? 0).getTime();
    return tb - ta;
  });

  const bundles: TaskMediaBundle[] = [];
  let totalMediaFiles = 0;
  let mediaApiBlocked = false;

  for (const raw of sorted.slice(0, taskLimit)) {
    const task = normalizeTask(raw, options.dockLabel);
    const { media, error } = await safeTaskMedia(fh2, task.id);
    const clipped = media.slice(0, mediaPerTask);
    totalMediaFiles += clipped.length;
    if (error?.includes("219021")) mediaApiBlocked = true;

    bundles.push({
      task,
      media: clipped,
      mediaError: error,
      mediaAvailable: clipped.length > 0,
    });
  }

  return { tasks: bundles, totalMediaFiles, mediaApiBlocked };
}

export function recentMediaMeta(
  result: RecentMediaResult,
): Record<string, unknown> {
  return {
    taskCount: result.tasks.length,
    totalMediaFiles: result.totalMediaFiles,
    source: "flighthub2",
    mediaApiBlocked: result.mediaApiBlocked,
    hint: result.mediaApiBlocked ? MEDIA_PERMISSION_HINT : undefined,
  };
}
