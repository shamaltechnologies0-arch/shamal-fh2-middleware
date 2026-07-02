import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createFh2Client } from "../fh2/client.js";
import type { Fh2Task } from "../fh2/types.js";
import {
  normalizeMedia,
  normalizeTask,
  normalizeTrajectory,
} from "../services/normalize.js";
import { registerViewerGet } from "./viewerPaths.js";

const tasksQuerySchema = z.object({
  sn: z.string().optional(),
  begin_at: z.coerce.number().optional(),
  end_at: z.coerce.number().optional(),
});

function defaultTimeRange(): { beginAt: number; endAt: number } {
  const endAt = Math.floor(Date.now() / 1000);
  const beginAt = endAt - 30 * 24 * 60 * 60;
  return { beginAt, endAt };
}

export const taskRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  registerViewerGet(
    app,
    "/v1/marafiq/tasks",
    {
      schema: {
        summary: "List Shamal flight / inspection tasks",
        description:
          "Second endpoint to test after devices. If this returns data, copy data[].id and use it as {id} in task detail, media, and trajectory endpoints.",
        tags: ["Tasks"],
        querystring: {
          type: "object",
          properties: {
            sn: {
              type: "string",
              description:
                "Optional Shamal device serialNumber from GET /v1/marafiq/devices. Leave empty to use the first project device.",
              examples: ["8UUXN6300A09XS", "1581F8HGX254W00A0CHR"],
            },
            begin_at: {
              type: "integer",
              description: "Optional Unix timestamp start time. Leave empty for last 30 days.",
            },
            end_at: {
              type: "integer",
              description: "Optional Unix timestamp end time. Leave empty for now.",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = tasksQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }

      const range = defaultTimeRange();
      const beginAt = parsed.data.begin_at ?? range.beginAt;
      const endAt = parsed.data.end_at ?? range.endAt;

      let deviceSn = parsed.data.sn;
      if (!deviceSn) {
        const devices = await fh2.listProjectDevices();
        deviceSn =
          devices.find((d) => d.gateway?.sn)?.gateway?.sn ??
          devices.find((d) => d.drone?.sn)?.drone?.sn;
      }

      if (!deviceSn) {
        return reply.status(400).send({
          error: "no_device",
          message: "No device SN provided and none found in project",
        });
      }

      const tasks = await fh2.listTasks({ sn: deviceSn, beginAt, endAt });
      return reply.send({
        data: tasks.map((t) => normalizeTask(t)),
        meta: { count: tasks.length, deviceSerialNumber: deviceSn, source: "flighthub2" },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/marafiq/tasks/:id",
    {
      schema: {
        summary: "Get Shamal task detail",
        description:
          "Use task id from GET /v1/marafiq/tasks -> data[].id. This is a FlightHub task UUID, not an email address.",
        tags: ["Tasks"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              format: "uuid",
              description: "Task UUID copied from GET /v1/marafiq/tasks -> data[].id",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const task = (await fh2.getTask(id)) as Fh2Task;
      if (!task || !(task as Fh2Task).uuid && !(task as Fh2Task).status) {
        return reply.status(404).send({ error: "not_found", message: "Task not found" });
      }
      const t = task as Fh2Task;
      const normalized = normalizeTask({
        ...t,
        uuid: t.uuid ?? id,
        name: t.name ?? "Unknown",
        status: t.status ?? "unknown",
        sn: t.sn ?? "",
      });

      return reply.send({ data: normalized, meta: { source: "flighthub2" } });
    },
  );

  registerViewerGet(
    app,
    "/v1/marafiq/tasks/:id/trajectory",
    {
      schema: {
        summary: "Get Shamal task trajectory",
        description:
          "Use task id from GET /v1/marafiq/tasks -> data[].id. This returns the flight path for a task.",
        tags: ["Tasks"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              format: "uuid",
              description: "Task UUID copied from GET /v1/marafiq/tasks -> data[].id",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const trajectory = await fh2.getTaskTrajectory(id);
      return reply.send({
        data: normalizeTrajectory(id, trajectory),
        meta: { source: "flighthub2" },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/marafiq/tasks/:id/media",
    {
      schema: {
        summary: "Get Shamal task media",
        description:
          "Use task id from GET /v1/marafiq/tasks -> data[].id. This field is not an email address or user name.",
        tags: ["Tasks"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              format: "uuid",
              description: "Task UUID copied from GET /v1/marafiq/tasks -> data[].id",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      let media;
      try {
        media = await fh2.getTaskMedia(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("219021")) {
          return reply.status(502).send({
            error: "fh2_media_unavailable",
            message:
              "FlightHub could not return media for this task (error 219021). Enable Task Management on the Organization Key in FlightHub Sync, then regenerate the key.",
            fh2Code: 219021,
          });
        }
        throw err;
      }
      return reply.send({
        data: normalizeMedia(media),
        meta: { count: media.length, source: "flighthub2" },
      });
    },
  );
};
