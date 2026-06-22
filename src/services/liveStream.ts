export type PlaybackType = "none" | "hls" | "rtmp" | "webrtc" | "http" | "volc";

export interface VolcRtcCredentials {
  appId: string;
  roomId: string;
  userId: string;
  token: string;
  expireTime?: number;
}

export interface StreamPlayback {
  type: PlaybackType;
  url: string | null;
  rtmpUrl: string | null;
  webrtcUrl: string | null;
  hlsUrl: string | null;
  volc: VolcRtcCredentials | null;
  embeddable: boolean;
  viewerNote: string;
}

/** Parse FH2 volc pull credentials (query-string form from /live-stream/start). */
export function parseVolcStreamUrl(raw: string): VolcRtcCredentials | null {
  try {
    const query = raw.startsWith("http")
      ? new URL(raw).search
      : raw.startsWith("?")
        ? raw
        : `?${raw}`;
    const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    const appId = params.get("app_id");
    const roomId = params.get("room_id");
    const userId = params.get("user_id");
    const token = params.get("token");
    if (!appId || !roomId || !userId || !token) return null;
    const expireRaw = params.get("expire_time");
    return {
      appId,
      roomId,
      userId,
      token,
      expireTime: expireRaw ? Number(expireRaw) : undefined,
    };
  } catch {
    return null;
  }
}

function collectUrls(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    if (/^(rtmp|webrtc|https?):\/\//i.test(node) || node.includes(".m3u8")) {
      out.push(node);
    }
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectUrls(item, out);
    return out;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectUrls(value, out);
    }
  }
  return out;
}

function classifyUrl(url: string): PlaybackType {
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8") || lower.includes("/hls")) return "hls";
  if (lower.startsWith("rtmp://") || lower.startsWith("rtmps://")) return "rtmp";
  if (
    lower.startsWith("webrtc://") ||
    lower.includes("whep") ||
    lower.includes("whip") ||
    lower.includes("webrtc")
  ) {
    return "webrtc";
  }
  if (lower.startsWith("http://") || lower.startsWith("https://")) return "http";
  return "none";
}

export function buildPlayback(
  liveCapacity: Record<string, unknown> | null,
  streamingSupported: boolean,
): StreamPlayback {
  if (!streamingSupported || !liveCapacity) {
    return {
      type: "none",
      url: null,
      rtmpUrl: null,
      webrtcUrl: null,
      hlsUrl: null,
      volc: null,
      embeddable: false,
      viewerNote:
        "No active live stream URL from FlightHub yet. Start live push in FlightHub/Dock, then refresh.",
    };
  }

  const urls = [...new Set(collectUrls(liveCapacity))];
  const rtmpUrl = urls.find((u) => classifyUrl(u) === "rtmp") ?? null;
  const webrtcUrl = urls.find((u) => classifyUrl(u) === "webrtc") ?? null;
  const hlsUrl = urls.find((u) => classifyUrl(u) === "hls") ?? null;
  const httpUrl = urls.find((u) => classifyUrl(u) === "http") ?? null;

  const primary =
    hlsUrl ?? httpUrl ?? webrtcUrl ?? rtmpUrl ?? urls[0] ?? null;
  const type = primary ? classifyUrl(primary) : "none";

  let viewerNote =
    "Stream metadata received from FlightHub. Embedded player activates when a playable URL is present.";
  let embeddable = false;

  if (type === "hls" || type === "http") {
    embeddable = true;
  } else if (type === "webrtc" && primary?.startsWith("http")) {
    embeddable = true;
    viewerNote = "WebRTC session page detected. Embedded in iframe when HTTPS/WHEP URL is available.";
  } else if (type === "rtmp") {
    viewerNote =
      "RTMP URL detected. Browsers cannot play RTMP directly; use the copy link or external player (VLC). HTTP-FLV/HLS proxy can be added in production.";
  }

  return {
    type,
    url: primary,
    rtmpUrl,
    webrtcUrl,
    hlsUrl,
    volc: null,
    embeddable,
    viewerNote,
  };
}
