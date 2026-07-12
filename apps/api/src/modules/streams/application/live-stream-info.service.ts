import { config } from "../../../config/env.js";
import type { Fh2LiveStreamInfo } from "../../../infrastructure/fh2/types.js";
import { buildPlayback } from "./live-stream.service.js";

const DEMO_HLS =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

export function buildLiveStreamInfo(
  deviceSn: string,
  online: boolean | null,
  liveCapacity: Record<string, unknown> | null,
  note: string,
): Fh2LiveStreamInfo {
  const streamingSupported = liveCapacity !== null;
  let playback = buildPlayback(liveCapacity, streamingSupported);

  if (
    config.FH2_MODE === "mock" &&
    !playback.url &&
    streamingSupported
  ) {
    playback = {
      type: "hls",
      url: DEMO_HLS,
      rtmpUrl: "rtmp://demo.shamal.local/live/drone",
      webrtcUrl: null,
      hlsUrl: DEMO_HLS,
      volc: null,
      embeddable: true,
      viewerNote:
        "Mock mode demo HLS player. In live mode, FlightHub issues RTMP/WebRTC URLs when a session is active.",
    };
  }

  return {
    deviceSerialNumber: deviceSn,
    online,
    streamingSupported,
    liveCapacity,
    playback,
    note,
  };
}
