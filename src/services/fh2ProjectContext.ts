import { AsyncLocalStorage } from "node:async_hooks";

export interface Fh2RequestContext {
  role?: "viewer" | "operator" | "admin";
  username?: string;
  projectCode?: string;
  allowedProjectCodes?: string[];
}

const storage = new AsyncLocalStorage<Fh2RequestContext>();

export function setFh2RequestContext(ctx: Fh2RequestContext): void {
  storage.enterWith(ctx);
}

export function getFh2RequestContext(): Fh2RequestContext {
  return storage.getStore() ?? {};
}
