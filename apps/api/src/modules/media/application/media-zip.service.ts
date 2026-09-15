import type { MediaCenterFile } from "./media-library.service.js";

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const MAX_ARCHIVE_FILES = 25;
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;

function dosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  const time =
    (date.getUTCHours() << 11) |
    (date.getUTCMinutes() << 5) |
    Math.floor(date.getUTCSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, date: dosDate };
}

function u16(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value >>> 0, 0);
  return buf;
}

function u32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return buf;
}

export function buildStoredZip(
  entries: Array<{ name: string; data: Buffer }>,
): Buffer {
  const { time, date } = dosDateTime();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const data = entry.data;
    const checksum = crc32(data) >>> 0;
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      data,
    ]);
    const central = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...locals, centralDir, eocd]);
}

function contentTypeForName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export async function fetchMediaBytes(
  file: MediaCenterFile,
): Promise<{ data: Buffer; contentType: string } | null> {
  const url = file.downloadUrl || file.previewUrl;
  if (!url || url.includes("example.invalid")) {
    return {
      data: Buffer.from(
        `Shamal Media Center placeholder for ${file.name}\nSource: FlightHub 2\nThis environment did not return a live download URL.\n`,
        "utf8",
      ),
      contentType: "text/plain; charset=utf-8",
    };
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return { data, contentType: contentTypeForName(file.name) };
  } catch {
    return null;
  }
}

export async function archiveMediaFiles(files: MediaCenterFile[]): Promise<{
  zip: Buffer;
  fileName: string;
  included: number;
  skipped: number;
}> {
  const selected = files.slice(0, MAX_ARCHIVE_FILES);
  const entries: Array<{ name: string; data: Buffer }> = [];
  let used = 0;
  let skipped = 0;
  const usedNames = new Set<string>();

  for (const file of selected) {
    const fetched = await fetchMediaBytes(file);
    if (!fetched) {
      skipped += 1;
      continue;
    }
    if (used + fetched.data.length > MAX_ARCHIVE_BYTES) {
      skipped += 1;
      continue;
    }
    let name = file.name || `${file.id}.bin`;
    if (usedNames.has(name)) {
      const dot = name.lastIndexOf(".");
      name =
        dot > 0
          ? `${name.slice(0, dot)}-${file.id.slice(0, 6)}${name.slice(dot)}`
          : `${name}-${file.id.slice(0, 6)}`;
    }
    usedNames.add(name);
    const folderPrefix = file.folderName.replace(/[<>:"/\\|?*]+/g, "_").slice(0, 80);
    entries.push({ name: `${folderPrefix}/${name}`, data: fetched.data });
    used += fetched.data.length;
  }

  if (entries.length === 0) {
    throw new Error("None of the selected media files could be downloaded from FlightHub.");
  }

  return {
    zip: buildStoredZip(entries),
    fileName: `shamal-media-${new Date().toISOString().slice(0, 10)}.zip`,
    included: entries.length,
    skipped,
  };
}

export { MAX_ARCHIVE_FILES };
