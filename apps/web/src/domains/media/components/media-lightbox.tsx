import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MediaFile } from "@/domains/media/types";
import { formatBytes, formatCapturedAt, isVideoMedia } from "@/domains/media/utils";
import { cn } from "@/lib/utils";

type MediaLightboxProps = {
  files: MediaFile[];
  index: number | null;
  downloading?: boolean;
  onIndexChange: (index: number | null) => void;
  onDownload?: (file: MediaFile) => void;
};

export function MediaLightbox({
  files,
  index,
  downloading = false,
  onIndexChange,
  onDownload,
}: MediaLightboxProps) {
  const open = index != null && Boolean(files[index]);
  const file = open && index != null ? files[index] : null;
  const video = file ? isVideoMedia(file) : false;
  const src = file ? file.previewUrl || file.downloadUrl : "";

  useEffect(() => {
    if (!open || index == null) return;
    function onKey(event: KeyboardEvent) {
      if (index == null) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onIndexChange(Math.min(files.length - 1, index + 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onIndexChange(Math.max(0, index - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, files.length, onIndexChange]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onIndexChange(null);
      }}
    >
      <DialogContent
        className="max-h-[92vh] w-[min(96vw,72rem)] overflow-hidden sm:max-w-[72rem]"
        showCloseButton
      >
        {file ? (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle className="truncate">{file.name}</DialogTitle>
              <DialogDescription>
                {video ? "Video" : "Photo"}
                {file.folderName ? ` · ${file.folderName}` : ""}
                {file.deviceSerialNumber ? ` · ${file.deviceSerialNumber}` : ""}
                {` · ${formatBytes(file.sizeBytes)} · ${formatCapturedAt(file.capturedAt)}`}
              </DialogDescription>
            </DialogHeader>
            <div className="relative flex min-h-[240px] max-h-[min(70vh,40rem)] items-center justify-center overflow-hidden rounded-lg bg-black">
              {video ? (
                <video
                  key={file.id}
                  src={src}
                  controls
                  playsInline
                  className="max-h-[min(70vh,40rem)] max-w-full"
                />
              ) : (
                <img
                  key={file.id}
                  src={src}
                  alt={file.name}
                  referrerPolicy="no-referrer"
                  className="max-h-[min(70vh,40rem)] max-w-full object-contain"
                />
              )}
              {files.length > 1 ? (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white hover:bg-black/80"
                    disabled={index === 0}
                    onClick={() => index != null && onIndexChange(Math.max(0, index - 1))}
                    aria-label="Previous file"
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 text-white hover:bg-black/80"
                    disabled={index === files.length - 1}
                    onClick={() =>
                      index != null && onIndexChange(Math.min(files.length - 1, index + 1))
                    }
                    aria-label="Next file"
                  >
                    <ChevronRight />
                  </Button>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {index != null ? `${index + 1} of ${files.length}` : null}
              </p>
              {onDownload ? (
                <Button size="sm" onClick={() => onDownload(file)} disabled={downloading}>
                  {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                  Download
                </Button>
              ) : (
                <a
                  href={file.downloadUrl || file.previewUrl}
                  download={file.name}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  <Download />
                  Download
                </a>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
