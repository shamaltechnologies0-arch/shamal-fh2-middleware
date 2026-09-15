import { useState } from "react";
import { Film, ImageIcon } from "lucide-react";
import type { MediaFile } from "@/domains/media/types";
import { isVideoMedia } from "@/domains/media/utils";
import { cn } from "@/lib/utils";

type MediaThumbProps = {
  file: MediaFile;
  className?: string;
  imgClassName?: string;
};

export function MediaThumb({ file, className, imgClassName }: MediaThumbProps) {
  const [failed, setFailed] = useState(false);
  const video = isVideoMedia(file);
  const src = file.previewUrl || file.downloadUrl;

  return (
    <div
      className={cn(
        "relative flex size-full items-center justify-center overflow-hidden bg-muted",
        className,
      )}
    >
      {!failed && src ? (
        video ? (
          <video
            src={src}
            muted
            playsInline
            preload="metadata"
            className={cn("size-full object-cover", imgClassName)}
            onError={() => setFailed(true)}
          />
        ) : (
          <img
            src={src}
            alt={file.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className={cn("size-full object-cover", imgClassName)}
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          {video ? <Film className="size-6" /> : <ImageIcon className="size-6" />}
        </div>
      )}
      {video ? (
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
          Video
        </span>
      ) : null}
    </div>
  );
}
