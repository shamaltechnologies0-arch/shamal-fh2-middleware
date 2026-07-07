import type { FastifyPluginAsync } from "fastify";
import { createFh2Client } from "../fh2/client.js";
import { registerViewerGet } from "./viewerPaths.js";

export const mappingRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  registerViewerGet(
    app,
    "/v1/mapping/models",
    {
      schema: {
        summary: "Cloud mapping / 2D-3D reconstruction jobs",
        description: "Lists orthomosaic and reconstruction models from FlightHub 2 open modeling.",
        tags: ["Mapping"],
      },
    },
    async (_request, reply) => {
      const models = await fh2.listMappingModels();
      return reply.send({
        data: models,
        meta: { count: models.length, source: "flighthub2" },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/mapping/models/:id",
    {
      schema: {
        summary: "Mapping model detail",
        tags: ["Mapping"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "Model id from GET /v1/mapping/models",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const model = await fh2.getMappingModel(id);
      if (!model) {
        return reply.status(404).send({ error: "not_found", message: "Mapping model not found" });
      }
      return reply.send({ data: model, meta: { source: "flighthub2" } });
    },
  );
};
