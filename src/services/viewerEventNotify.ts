import { config } from "../config.js";

export async function notifyViewerEventCallback(event: {
  id: string;
  type: string;
  source?: string;
  payload?: Record<string, unknown>;
  receivedAt: string;
}): Promise<void> {
  if (!config.VIEWER_EVENT_CALLBACK_URL) {
    return;
  }

  try {
    await fetch(config.VIEWER_EVENT_CALLBACK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.VIEWER_EVENT_CALLBACK_SECRET
          ? { "X-Shamal-Signature": config.VIEWER_EVENT_CALLBACK_SECRET }
          : {}),
      },
      body: JSON.stringify({ event }),
    });
  } catch (err) {
    console.warn("[viewer-event-callback] delivery failed:", (err as Error).message);
  }
}
