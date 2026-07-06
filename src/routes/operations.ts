import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { insertWebhookEvent } from "../db/index.js";
import { createFh2Client } from "../fh2/client.js";
import {
  OPERATIONS_CATALOG,
  OP_CATEGORIES,
  type OpBlockRule,
  type OpDefinition,
} from "../services/operationsCatalog.js";
import { flattenDevices } from "../services/normalize.js";
import { resolveTelemetry } from "../services/telemetryStore.js";

type OpState = "accepted" | "running" | "completed" | "blocked" | "failed";

interface OpLogRow {
  id: string;
  action: string;
  deviceSn: string;
  missionId?: string;
  status: OpState;
  reason?: string;
  risk?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

const operations = new Map<string, OpLogRow>();

const opBodySchema = z.object({
  deviceSn: z.string().min(3),
  safetyConfirm: z.literal(true),
  missionId: z.string().optional(),
  note: z.string().optional(),
  altitudeM: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

function toModeCodeString(raw: Record<string, unknown>): string {
  const deviceState = (raw.device_state as Record<string, unknown> | undefined) ?? raw;
  const mode = deviceState.mode_code;
  return typeof mode === "string" ? mode : typeof mode === "number" ? String(mode) : "unknown";
}

function evaluateBlock(
  rule: OpBlockRule,
  modeCode: string,
  online: boolean | null,
  deviceRole: string,
  op: OpDefinition,
): { blocked: boolean; reason?: string } {
  if (op.deviceRole === "drone" && deviceRole === "gateway") {
    return {
      blocked: true,
      reason: `Select a drone serial for "${op.label}" (this action is not for dock gateways).`,
    };
  }
  if (op.deviceRole === "gateway" && deviceRole === "drone") {
    return {
      blocked: true,
      reason: `Select a dock gateway serial for "${op.label}".`,
    };
  }

  const notConnected = modeCode.toLowerCase().includes("not_connected");

  switch (rule) {
    case "none":
      return { blocked: false };
    case "command_ready":
      if (notConnected) {
        return {
          blocked: true,
          reason:
            "Drone is not command-ready in FlightHub (mode_code indicates not_connected). Connect via dock or RC first.",
        };
      }
      return { blocked: false };
    case "online":
      if (online === false) {
        return {
          blocked: true,
          reason: "Device is offline in FlightHub. Wait for online status before sending this command.",
        };
      }
      return { blocked: false };
    case "gateway_online":
      if (deviceRole !== "gateway") {
        return { blocked: true, reason: "Dock action requires a gateway (dock) device." };
      }
      if (online === false) {
        return {
          blocked: true,
          reason: "Dock is offline. Restore dock connectivity before this operation.",
        };
      }
      return { blocked: false };
    default:
      return { blocked: false };
  }
}

export const operationRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  const handleAction = async (
    op: OpDefinition,
    body: z.infer<typeof opBodySchema>,
  ): Promise<OpLogRow> => {
    const [stateResult, entries] = await Promise.all([
      resolveTelemetry(body.deviceSn, () => fh2.getDeviceState(body.deviceSn)),
      fh2.listProjectDevices(),
    ]);
    const devices = flattenDevices(entries);
    const device = devices.find((d) => d.serialNumber === body.deviceSn);
    const deviceRole = device?.role ?? "drone";
    const online = device?.online ?? null;

    const state = stateResult.data.rawState;
    const modeCode = toModeCodeString({ device_state: state });
    const telemetry = stateResult.data;
    const { blocked, reason } = evaluateBlock(
      op.blockRule,
      modeCode,
      online,
      deviceRole,
      op,
    );

    const opId = randomUUID();
    const now = new Date().toISOString();

    const row: OpLogRow = {
      id: opId,
      action: op.action,
      deviceSn: body.deviceSn,
      missionId: body.missionId,
      status: blocked ? "blocked" : "accepted",
      reason: blocked
        ? reason
        : "Command accepted by middleware. Routed for FlightHub operational channel when device is ready.",
      risk: op.risk,
      category: op.category,
      createdAt: now,
      updatedAt: now,
    };

    operations.set(opId, row);

    await insertWebhookEvent(
      blocked ? `ops_${op.action}_blocked` : `ops_${op.action}_requested`,
      {
        opId,
        action: op.action,
        label: op.label,
        category: op.category,
        risk: op.risk,
        fh2Capability: op.fh2Capability,
        deviceSn: body.deviceSn,
        deviceRole,
        missionId: body.missionId ?? null,
        modeCode,
        online,
        telemetry,
        altitudeM: body.altitudeM ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        note: body.note ?? null,
      },
      "ops",
    );

    return row;
  };

  app.get(
    "/v1/platform/ops/catalog",
    { schema: { hide: true, summary: "Operations catalog (FH2-aligned)", tags: ["Operations"] } },
    async () => ({
      data: {
        categories: OP_CATEGORIES,
        operations: OPERATIONS_CATALOG,
      },
      meta: {
        count: OPERATIONS_CATALOG.length,
        note: "Commands are gated by device readiness; execute via Shamal → FlightHub when accepted.",
      },
    }),
  );

  app.get<{ Params: { sn: string } }>(
    "/v1/platform/ops/readiness/:sn",
    { schema: { hide: true, summary: "Device command readiness snapshot", tags: ["Operations"] } },
    async (request, reply) => {
      const sn = request.params.sn;
      const [telemetryResult, entries] = await Promise.all([
        resolveTelemetry(sn, () => fh2.getDeviceState(sn)),
        fh2.listProjectDevices(),
      ]);
      const devices = flattenDevices(entries);
      const device = devices.find((d) => d.serialNumber === sn);
      const modeCode = toModeCodeString({ device_state: telemetryResult.data.rawState });
      const notConnected = modeCode.toLowerCase().includes("not_connected");

      return {
        data: {
          serialNumber: sn,
          role: device?.role ?? null,
          online: device?.online ?? null,
          modelName: device?.modelName ?? null,
          modeCode,
          commandReady: device?.online === true && !notConnected,
          gatewaySerialNumber: device?.gatewaySerialNumber ?? null,
          telemetry: telemetryResult.data,
        },
        meta: {
          source: "flighthub2",
          capturedAt: telemetryResult.data.capturedAt,
          freshness: telemetryResult.freshness,
          note:
            device?.role === "gateway"
              ? "Flight commands require the paired drone serial, not the dock gateway. Select the Matrice drone in the target dropdown."
              : telemetryResult.note,
        },
      };
    },
  );

  for (const op of OPERATIONS_CATALOG) {
    app.post(
      `/v1/platform/ops/${op.path}`,
      {
        schema: {
          hide: true,
          summary: `Operation: ${op.label}`,
          description: op.description,
          tags: ["Operations"],
        },
      },
      async (request, reply) => {
        const parsed = opBodySchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
        }
        if (op.requiresMissionId && !parsed.data.missionId) {
          return reply.status(400).send({
            error: "validation_error",
            message: `missionId is required for ${op.label}`,
          });
        }
        const row = await handleAction(op, parsed.data);
        return reply.send({ data: row, meta: { source: "shamal-middleware", fh2Capability: op.fh2Capability } });
      },
    );
  }

  app.get<{ Params: { id: string } }>(
    "/v1/platform/ops/status/:id",
    { schema: { hide: true, summary: "Operation status", tags: ["Operations"] } },
    async (request, reply) => {
      const row = operations.get(request.params.id);
      if (!row) {
        return reply.status(404).send({ error: "not_found", message: "Operation id not found" });
      }
      return reply.send({ data: row, meta: { source: "shamal-middleware" } });
    },
  );

  app.get(
    "/v1/platform/ops/log",
    { schema: { hide: true, summary: "Operation log", tags: ["Operations"] } },
    async (request) => {
      const limitRaw = (request.query as { limit?: string | number }).limit;
      const limit = Math.max(1, Math.min(200, Number(limitRaw ?? 50)));
      const rows = [...operations.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
      return { data: rows, meta: { count: rows.length } };
    },
  );
};
