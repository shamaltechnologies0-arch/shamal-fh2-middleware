import type { FastifyPluginAsync } from "fastify";
import { createFh2Client } from "../fh2/client.js";
import { trajectoryToGeoJson, trajectoryToKml } from "../services/gis.js";
import { normalizeTrajectory } from "../services/normalize.js";
import { registerViewerGet } from "./viewerPaths.js";

export const gisRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  const loadTrajectory = async (taskId: string) => {
    const trajectory = await fh2.getTaskTrajectory(taskId);
    return normalizeTrajectory(taskId, trajectory);
  };

  registerViewerGet(
    app,
    "/v1/tasks/:id/trajectory.geojson",
    {
      schema: {
        summary: "Flight path as GeoJSON",
        description: "Use task id from GET /v1/tasks. Import into CAFM/GIS layers.",
        tags: ["GIS"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const trajectory = await loadTrajectory(id);
      return reply
        .header("Content-Type", "application/geo+json")
        .send(trajectoryToGeoJson(trajectory));
    },
  );

  registerViewerGet(
    app,
    "/v1/tasks/:id/trajectory.kml",
    {
      schema: {
        summary: "Flight path as KML",
        tags: ["GIS"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const trajectory = await loadTrajectory(id);
      return reply
        .header("Content-Type", "application/vnd.google-earth.kml+xml")
        .send(trajectoryToKml(trajectory));
    },
  );
};
