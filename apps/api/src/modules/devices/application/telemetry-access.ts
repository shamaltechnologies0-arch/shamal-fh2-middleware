import type { FastifyReply, FastifyRequest } from "fastify";
import type { IFh2Client } from "../../../infrastructure/fh2/types.js";
import { flattenDevices } from "../../../shared/normalize/normalize.service.js";
import { sendDataAccessDenied } from "../../../shared/security/data-access.js";
import {
  hasViewerScope,
  telemetryScopeForDeviceRole,
} from "../../integrations/application/viewer-scopes.service.js";

export async function assertTelemetryScopeForSerial(
  fh2: IFh2Client,
  request: FastifyRequest,
  reply: FastifyReply,
  sn: string,
): Promise<boolean> {
  if (!request.viewerScopes) return true;
  const devices = flattenDevices(await fh2.listProjectDevices());
  const device = devices.find((d) => d.serialNumber === sn);
  const required = telemetryScopeForDeviceRole(device?.role);
  if (!hasViewerScope(request.viewerScopes, required)) {
    sendDataAccessDenied(reply);
    return false;
  }
  return true;
}
