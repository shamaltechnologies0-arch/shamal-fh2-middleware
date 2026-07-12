import type { FastifyPluginAsync } from "fastify";
import { createFh2Client } from "../../../../infrastructure/fh2/client.js";
import {
  findDeviceEntry,
  flattenDevices,
  normalizeHms,
} from "../../../../shared/normalize/normalize.service.js";
import { cacheTelemetry, resolveTelemetry } from "../../application/telemetry-store.service.js";
import { registerViewerGet } from "../../../../shared/http/viewer-paths.js";

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  registerViewerGet(
    app,
    "/v1/devices",
    {
      schema: {
        summary: "List Shamal fleet devices",
        description:
          "First endpoint to test. Copy data[].serialNumber from this response and use it as {sn} in device detail and telemetry endpoints.",
        tags: ["Devices"],
      },
    },
    async (_request, reply) => {
      const entries = await fh2.listProjectDevices();
      return reply.send({
        data: flattenDevices(entries),
        meta: { count: flattenDevices(entries).length, source: "flighthub2" },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/devices/:sn",
    {
      schema: {
        summary: "Get Shamal device detail",
        tags: ["Devices"],
      },
    },
    async (request, reply) => {
      const { sn } = request.params as { sn: string };
      const entries = await fh2.listProjectDevices();
      const entry = findDeviceEntry(entries, sn);

      if (!entry) {
        return reply.status(404).send({
          error: "not_found",
          message: `Device ${sn} not found in project`,
        });
      }

      const [telemetryResult, hms] = await Promise.all([
        resolveTelemetry(sn, () => fh2.getDeviceState(sn)),
        fh2.getDeviceHms([sn]).catch(() => []),
      ]);

      const device = flattenDevices([entry]).find((d) => d.serialNumber === sn);

      return reply.send({
        data: {
          device,
          health: normalizeHms(hms),
          stateSummary: telemetryResult.data,
        },
        meta: {
          source: "flighthub2",
          freshness: telemetryResult.freshness,
          note: telemetryResult.note,
        },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/devices/:sn/telemetry/latest",
    {
      schema: {
        summary: "Get latest Shamal telemetry snapshot",
        tags: ["Devices"],
      },
    },
    async (request, reply) => {
      const { sn } = request.params as { sn: string };
      const result = await resolveTelemetry(sn, () => fh2.getDeviceState(sn));
      return reply.send({
        data: result.data,
        meta: {
          source: "flighthub2",
          freshness: result.freshness,
          refreshRecommendationSec: 10,
          note:
            result.note ??
            (result.freshness === "live"
              ? "Live telemetry from FlightHub device state."
              : "Snapshot telemetry via REST polling."),
        },
      });
    },
  );
};
