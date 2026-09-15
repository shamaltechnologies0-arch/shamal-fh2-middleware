import type { MediaFile, MediaSort, MediaView } from "@/domains/media/types";

export function isVideoMedia(file: Pick<MediaFile, "mediaType" | "name">): boolean {
  const type = String(file.mediaType ?? "").toLowerCase();
  const name = file.name?.toLowerCase() ?? "";
  return type === "video" || type.includes("video") || /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(name);
}

export function isImageMedia(file: Pick<MediaFile, "mediaType" | "name">): boolean {
  const type = String(file.mediaType ?? "").toLowerCase();
  const name = file.name?.toLowerCase() ?? "";
  return (
    type === "image" ||
    type.includes("image") ||
    type.includes("photo") ||
    /\.(jpe?g|png|webp|heic|dng|tiff?)$/i.test(name)
  );
}

export function matchesView(file: MediaFile, view: MediaView): boolean {
  if (view === "folders") return true;
  if (view === "videos") return isVideoMedia(file);
  return isImageMedia(file);
}

export function sortMediaFiles(files: MediaFile[], sort: MediaSort): MediaFile[] {
  return [...files].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "size") return (b.sizeBytes || 0) - (a.sizeBytes || 0);
    const ta = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
    const tb = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
    return sort === "oldest" ? ta - tb : tb - ta;
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatCapturedAt(iso: string | null | undefined): string {
  if (!iso) return "Unknown time";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function folderTitle(task: {
  folderLabel?: string | null;
  name?: string;
  id?: string;
}): string {
  return task.folderLabel || task.name || task.id || "Untitled folder";
}

export function uploadStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return status.replaceAll("_", " ");
}

export function uploadStatusVariant(
  status: string | null | undefined,
): "success" | "warning" | "info" | "neutral" {
  const value = (status ?? "").toLowerCase();
  if (value.includes("finish") || value.includes("success") || value === "ok") return "success";
  if (value.includes("upload") || value.includes("pending") || value.includes("progress")) {
    return "warning";
  }
  if (value.includes("fail") || value.includes("error")) return "info";
  return "neutral";
}
