import type { FastifyPluginAsync } from "fastify";
import { createFh2Client } from "../fh2/client.js";
import {
  findDeviceEntry,
  flattenDevices,
  normalizeHms,
  normalizeTelemetry,
} from "../services/normalize.js";
import { registerViewerGet } from "./viewerPaths.js";

export const dockRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  registerViewerGet(
    app,
    "/v1/docks",
    {
      schema: {
        summary: "List Shamal DJI docks (gateways)",
        tags: ["Docks"],
      },
    },
    async (_request, reply) => {
      const docks = flattenDevices(await fh2.listProjectDevices()).filter(
        (d) => d.role === "gateway",
      );
      return reply.send({
        data: docks,
        meta: { count: docks.length, source: "flighthub2" },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/docks/:sn",
    {
      schema: {
        summary: "Dock detail and health",
        description: "Use dock serialNumber from GET /v1/docks or /devices.",
        tags: ["Docks"],
        params: {
          type: "object",
          required: ["sn"],
          properties: {
            sn: { type: "string", examples: ["8UUXN6300A09XS"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { sn } = request.params as { sn: string };
      const entries = await fh2.listProjectDevices();
      const entry = findDeviceEntry(entries, sn);

      if (!entry?.gateway?.sn) {
        return reply.status(404).send({ error: "not_found", message: `Dock ${sn} not found` });
      }

      const [state, hms] = await Promise.all([
        fh2.getDeviceState(sn),
        fh2.getDeviceHms([sn]),
      ]);

      const dock = flattenDevices([entry]).find((d) => d.serialNumber === sn);

      return reply.send({
        data: {
          dock,
          linkedDroneSerialNumber: entry.drone?.sn ?? null,
          health: normalizeHms(hms),
          stateSummary: normalizeTelemetry(sn, state),
        },
        meta: { source: "flighthub2" },
      });
    },
  );
};
