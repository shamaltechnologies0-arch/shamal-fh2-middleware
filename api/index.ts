import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getApp } from "../dist/bootstrap.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  app.server.emit("request", req, res);
}
