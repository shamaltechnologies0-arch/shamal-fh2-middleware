import type { CcRole } from "./commandCenterAuth.js";
import type { ViewerApiScope } from "./viewerScopes.js";

declare module "fastify" {
  interface FastifyRequest {
    ccRole?: CcRole;
    ccUsername?: string;
    allowedProjectCodes?: string[];
    selectedProjectCode?: string;
    viewerIntegration?: {
      viewerId: string;
      scopes: ViewerApiScope[];
    };
    restApiKey?: {
      userId: string;
      keyId: string;
    };
    serviceAccount?: {
      accountId: string;
      ownerUserId: string;
      clientId: string;
      scopes: ViewerApiScope[];
    };
  }
}
