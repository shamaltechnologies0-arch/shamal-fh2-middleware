import type { FastifyPluginAsync } from "fastify";
import { createFh2Client } from "../fh2/client.js";
import { flattenDevices } from "../services/normalize.js";
import { resolveTelemetry } from "../services/telemetryStore.js";
import { registerViewerGet } from "./viewerPaths.js";

export const fleetRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  registerViewerGet(
    app,
    "/v1/viewer/fleet/summary",
    {
      schema: {
        summary: "Fleet summary for CAFM dashboards",
        description:
          "Counts Shamal drones and docks with online/offline status from FlightHub 2.",
        tags: ["Fleet"],
      },
    },
    async (_request, reply) => {
      const devices = flattenDevices(await fh2.listProjectDevices());
      const drones = devices.filter((d) => d.role === "drone");
      const docks = devices.filter((d) => d.role === "gateway");
      const online = devices.filter((d) => d.online === true).length;
      const offline = devices.filter((d) => d.online === false).length;

      return reply.send({
        data: {
          totalDevices: devices.length,
          drones: drones.length,
          docks: docks.length,
          online,
          offline,
          unknown: devices.length - online - offline,
          devices,
        },
        meta: { source: "flighthub2" },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/viewer/fleet/positions",
    {
      schema: {
        summary: "Fleet map positions (GPS pins for live map)",
        tags: ["Fleet"],
      },
    },
    async (_request, reply) => {
      const devices = flattenDevices(await fh2.listProjectDevices());
      const positions = await Promise.all(
        devices.map(async (device) => {
          const result = await resolveTelemetry(device.serialNumber, () =>
            fh2.getDeviceState(device.serialNumber),
          );
          return {
            serialNumber: device.serialNumber,
            role: device.role,
            callsign: device.callsign,
            modelName: device.modelName,
            online: device.online,
            latitude: result.data.latitude,
            longitude: result.data.longitude,
            altitudeM: result.data.altitudeM,
            batteryPercent: result.data.batteryPercent,
            headingDeg: result.data.headingDeg,
            freshness: result.freshness,
            capturedAt: result.data.capturedAt,
          };
        }),
      );

      return reply.send({
        data: positions,
        meta: { count: positions.length, source: "flighthub2" },
      });
    },
  );
};
