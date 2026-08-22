import type { FastifyPluginAsync } from "fastify";
import { createFh2Client } from "../../../../infrastructure/fh2/client.js";
import { registerViewerGet } from "../../../../shared/http/viewer-paths.js";
import { sendDataAccessDenied } from "../../../../shared/security/data-access.js";
import { hasViewerScope } from "../../../integrations/application/viewer-scopes.service.js";

export const streamRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  registerViewerGet(
    app,
    "/v1/devices/:sn/live-stream",
    {
      schema: {
        summary: "Live video stream info (RTMP/WebRTC capacity)",
        description:
          "Returns live stream capacity for the device. Use this to know if live video is available before embedding a player.",
        tags: ["Streams"],
        params: {
          type: "object",
          required: ["sn"],
          properties: {
            sn: {
              type: "string",
              description: "Drone or dock serialNumber from GET /v1/devices",
            },
          },
        },
        querystring: {
          type: "object",
          properties: {
            camera: {
              type: "string",
              enum: ["drone", "dock", "auto"],
              description: "Prefer drone FPV or dock camera when resolving stream target",
            },
            share_url: {
              type: "string",
              description: "Optional livestream sharing URL fallback when live capacity is unavailable",
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { sn } = request.params as { sn: string };
        const query = request.query as {
          camera?: "drone" | "dock" | "auto";
          share_url?: string;
        };
        let camera = query.camera ?? "auto";
        if (request.viewerScopes) {
          const canDock = hasViewerScope(request.viewerScopes, "camera:read");
          const canDrone = hasViewerScope(request.viewerScopes, "fpv:read");
          if (camera === "drone" && !canDrone) return sendDataAccessDenied(reply);
          if (camera === "dock" && !canDock) return sendDataAccessDenied(reply);
          if (camera === "auto") {
            if (canDrone && !canDock) camera = "drone";
            else if (canDock && !canDrone) camera = "dock";
          }
        }
        const info = await fh2.getDeviceLiveStreamInfo(sn, {
          camera,
          shareUrl: query.share_url,
        });
        return reply.send({ data: info, meta: { source: "flighthub2" } });
      } catch (err) {
        return reply.status(502).send({
          error: "fh2_error",
          message: err instanceof Error ? err.message : "Failed to load live stream info",
        });
      }
    },
  );
};
