import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createFh2Client } from "../fh2/client.js";
import { flattenDevices } from "../services/normalize.js";
import {
  loadRecentTaskMedia,
  recentMediaMeta,
} from "../services/recentMedia.js";
import { registerViewerGet } from "./viewerPaths.js";

const mediaQuerySchema = z.object({
  sn: z.string().optional(),
  begin_at: z.coerce.number().optional(),
  end_at: z.coerce.number().optional(),
  task_limit: z.coerce.number().min(1).max(20).optional(),
  media_per_task: z.coerce.number().min(1).max(50).optional(),
});

function defaultTimeRange(): { beginAt: number; endAt: number } {
  const endAt = Math.floor(Date.now() / 1000);
  const beginAt = endAt - 14 * 24 * 60 * 60;
  return { beginAt, endAt };
}

export const mediaRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  registerViewerGet(
    app,
    "/v1/media/recent",
    {
      schema: {
        summary: "Recent flight tasks with FH2 media file names",
        description:
          "Lists recent FlightHub tasks and photo/video file names from each task's media library folder. Requires Task Management permission on the Organization Key.",
        tags: ["Tasks"],
      },
    },
    async (request, reply) => {
      const parsed = mediaQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      const range = defaultTimeRange();
      const beginAt = parsed.data.begin_at ?? range.beginAt;
      const endAt = parsed.data.end_at ?? range.endAt;

      let deviceSn = parsed.data.sn;
      let dockLabel = "DJI Dock 3";
      const devices = flattenDevices(await fh2.listProjectDevices());
      if (!deviceSn) {
        const dock = devices.find((d) => d.role === "gateway");
        deviceSn = dock?.serialNumber ?? devices[0]?.serialNumber;
        if (dock?.modelName) dockLabel = dock.modelName;
      } else {
        const match = devices.find((d) => d.serialNumber === deviceSn);
        if (match?.modelName) dockLabel = match.modelName;
      }

      if (!deviceSn) {
        return reply.status(400).send({
          error: "no_device",
          message: "No device SN provided and none found in project",
        });
      }

      const result = await loadRecentTaskMedia(fh2, {
        deviceSn,
        beginAt,
        endAt,
        taskLimit: parsed.data.task_limit,
        mediaPerTask: parsed.data.media_per_task,
        dockLabel,
      });

      return reply.send({
        data: result.tasks,
        meta: recentMediaMeta(result),
      });
    },
  );
};
