import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  Film,
  FolderOpen,
  HardDrive,
  ImageIcon,
  Images,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/stat-card";
import { useAuth } from "@/domains/auth/contexts/auth-context";
import { MediaLightbox } from "@/domains/media/components/media-lightbox";
import { MediaThumb } from "@/domains/media/components/media-thumb";
import {
  downloadMediaArchive,
  downloadMediaFile,
  fetchMediaLibrary,
} from "@/domains/media/services/media.service";
import type { MediaFile, MediaFolder, MediaLibraryCatalog, MediaSort, MediaView } from "@/domains/media/types";
import {
  formatBytes,
  formatCapturedAt,
  isVideoMedia,
  matchesView,
  sortMediaFiles,
  uploadStatusLabel,
  uploadStatusVariant,
} from "@/domains/media/utils";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

function canAccessMedia(role: string | undefined, missionMediaHistory?: boolean): boolean {
  if (role === "admin" || role === "operator") return true;
  return missionMediaHistory !== false;
}

const SORT_OPTIONS: Array<{ id: MediaSort; label: string }> = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "name", label: "Name" },
  { id: "size", label: "Size" },
];

const VIEW_OPTIONS: Array<{ id: MediaView; label: string; icon: typeof FolderOpen }> = [
  { id: "folders", label: "Folders", icon: FolderOpen },
  { id: "images", label: "Images", icon: ImageIcon },
  { id: "videos", label: "Videos", icon: Film },
];

export function MediaLibrary() {
  const { session } = useAuth();
  const allowed = canAccessMedia(session?.role, session?.viewerDashboardPermissions?.missionMediaHistory);

  const [catalog, setCatalog] = useState<MediaLibraryCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<MediaView>("folders");
  const [sort, setSort] = useState<MediaSort>("newest");
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadLibrary = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchMediaLibrary();
      setCatalog(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the Media Center.");
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    function onRefresh() {
      void loadLibrary();
    }
    window.addEventListener("shamal-refresh-media", onRefresh);
    window.addEventListener("shamal-project-changed", onRefresh);
    return () => {
      window.removeEventListener("shamal-refresh-media", onRefresh);
      window.removeEventListener("shamal-project-changed", onRefresh);
    };
  }, [loadLibrary]);

  const needle = query.trim().toLowerCase();
  const openFolder = catalog?.folders.find((folder) => folder.id === openFolderId) ?? null;

  const visibleFiles = useMemo(() => {
    const files = catalog?.files ?? [];
    const filtered = files.filter((file) => {
      if (view === "folders" && openFolderId && file.folderId !== openFolderId) return false;
      if (view !== "folders" && !matchesView(file, view)) return false;
      if (!needle) return true;
      return [file.name, file.folderName, file.taskName, file.deviceSerialNumber]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    return sortMediaFiles(filtered, sort);
  }, [catalog, view, openFolderId, needle, sort]);

  const visibleFolders = useMemo(() => {
    const folders = catalog?.folders ?? [];
    if (view !== "folders" || openFolderId) return [];
    if (!needle) return folders;
    return folders.filter((folder) => {
      const haystack = [folder.name, folder.deviceSerialNumber, String(folder.fh2FolderId ?? "")].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [catalog, view, openFolderId, needle]);

  const totals = useMemo(() => {
    const files = catalog?.files ?? [];
    return {
      folders: catalog?.folders.length ?? 0,
      files: files.length,
      photos: files.filter((file) => !isVideoMedia(file)).length,
      videos: files.filter((file) => isVideoMedia(file)).length,
    };
  }, [catalog]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelected(new Set(visibleFiles.map((file) => file.id)));
  }

  async function handleDownloadFile(file: MediaFile) {
    setDownloading(true);
    try {
      await downloadMediaFile(file);
      toast.success(`Downloaded ${file.name}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDownloading(true);
    try {
      if (ids.length === 1) {
        const file = (catalog?.files ?? []).find((item) => item.id === ids[0]);
        if (file) await downloadMediaFile(file);
      } else {
        await downloadMediaArchive({ fileIds: ids });
      }
      toast.success(ids.length === 1 ? "Download started" : `Downloaded ${ids.length} files as ZIP`);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Bulk download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadFolder(folderId: string, folderName: string) {
    setDownloading(true);
    try {
      await downloadMediaArchive({ folderId });
      toast.success(`Downloaded folder “${folderName}”`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Folder download failed");
    } finally {
      setDownloading(false);
    }
  }

  if (!allowed) {
    return (
      <div className="flex h-full flex-col overflow-auto p-4 sm:p-6">
        <PageHeader title="Media Center" description="Photos and videos captured by docked aircraft." />
        <EmptyState
          icon={<Images className="size-6" />}
          title="Media access is not enabled"
          description="Your administrator has not enabled Media Library access for this account."
        />
      </div>
    );
  }

  const showingFiles = view !== "folders" || Boolean(openFolderId);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto p-4 sm:p-6">
      <PageHeader
        title="Media Center"
        description="Browse, preview, and download drone-captured photos and videos."
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadLibrary()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {catalog?.storage ? (
        <Alert className="mt-4">
          <HardDrive className="size-4" />
          <AlertTitle>{catalog.storage.container}</AlertTitle>
          <AlertDescription>{catalog.storage.note}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Folders" value={totals.folders} hint="One folder per completed mission" />
        <StatCard label="Files" value={totals.files} />
        <StatCard label="Images" value={totals.photos} />
        <StatCard label="Videos" value={totals.videos} />
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-[3px]">
          {VIEW_OPTIONS.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={view === option.id ? "secondary" : "ghost"}
              className={cn(view === option.id && "bg-background shadow-sm")}
              onClick={() => {
                setView(option.id);
                setLightboxIndex(null);
                setSelected(new Set());
                if (option.id !== "folders") setOpenFolderId(null);
              }}
            >
              <option.icon />
              {option.label}
            </Button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={showingFiles ? "Search files, folders, or serials…" : "Search folders…"}
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-[3px]">
            {SORT_OPTIONS.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={sort === option.id ? "secondary" : "ghost"}
                className={cn(sort === option.id && "bg-background shadow-sm")}
                onClick={() => setSort(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
          <p className="text-sm font-medium">
            {selected.size} file{selected.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={selectVisible} disabled={visibleFiles.length === 0}>
              Select visible
            </Button>
            <Button size="sm" onClick={() => void handleDownloadSelected()} disabled={downloading}>
              {downloading ? <Loader2 className="animate-spin" /> : <Download />}
              Download selected
            </Button>
          </div>
        </div>
      ) : null}

      {catalog?.hint ? (
        <Alert className="mt-4">
          <AlertTitle>FlightHub media permission</AlertTitle>
          <AlertDescription>{catalog.hint}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <ErrorState
          title="Media Center unavailable"
          description={error}
          action={
            <Button variant="outline" onClick={() => void loadLibrary()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {loading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : null}

      {!loading && !error && view === "folders" && !openFolderId ? (
        visibleFolders.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={<FolderOpen className="size-6" />}
            title="No media folders yet"
            description="When the drone captures photos or videos, each mission appears here as a folder."
          />
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleFolders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                previews={(catalog?.files ?? []).filter((file) => file.folderId === folder.id).slice(0, 4)}
                downloading={downloading}
                onOpen={() => {
                  setOpenFolderId(folder.id);
                  setSelected(new Set());
                  setLightboxIndex(null);
                }}
                onDownload={() => void handleDownloadFolder(folder.id, folder.name)}
              />
            ))}
          </div>
        )
      ) : null}

      {!loading && !error && showingFiles ? (
        <div className="mt-4 flex min-h-0 flex-col gap-4">
          {openFolder ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOpenFolderId(null);
                    setSelected(new Set());
                    setLightboxIndex(null);
                  }}
                >
                  <ArrowLeft />
                  All folders
                </Button>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{openFolder.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {openFolder.fh2FolderId != null
                      ? `FlightHub folder #${openFolder.fh2FolderId}`
                      : "FlightHub mission folder"}
                    {openFolder.deviceSerialNumber ? ` · Drone ${openFolder.deviceSerialNumber}` : ""}
                    {openFolder.capturedAt ? ` · ${formatCapturedAt(openFolder.capturedAt)}` : ""}
                    {` · ${formatBytes(openFolder.totalBytes)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge variant={uploadStatusVariant(openFolder.mediaUploadStatus)}>
                  {uploadStatusLabel(openFolder.mediaUploadStatus || openFolder.taskStatus)}
                </StatusBadge>
                <Button
                  size="sm"
                  onClick={() => void handleDownloadFolder(openFolder.id, openFolder.name)}
                  disabled={downloading || openFolder.fileCount === 0}
                >
                  {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                  Download folder
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {view === "videos" ? "Videos" : "Images"}
              </h2>
              {visibleFiles.length > 0 ? (
                <Button variant="outline" size="sm" onClick={selectVisible}>
                  Select all visible
                </Button>
              ) : null}
            </div>
          )}

          {visibleFiles.length === 0 ? (
            <EmptyState
              icon={view === "videos" ? <Film className="size-6" /> : <Images className="size-6" />}
              title={openFolder ? "This folder is empty" : "No files match this view"}
              description="Captured media appears here after FlightHub finishes uploading from the aircraft."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {visibleFiles.map((file, index) => (
                <FileCard
                  key={file.id || `${file.name}-${index}`}
                  file={file}
                  selected={selected.has(file.id)}
                  downloading={downloading}
                  onOpen={() => setLightboxIndex(index)}
                  onToggle={() => toggleSelected(file.id)}
                  onDownload={() => void handleDownloadFile(file)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      <MediaLightbox
        files={visibleFiles}
        index={lightboxIndex}
        downloading={downloading}
        onIndexChange={setLightboxIndex}
        onDownload={(file) => void handleDownloadFile(file)}
      />
    </div>
  );
}

function FolderCard({
  folder,
  previews,
  downloading,
  onOpen,
  onDownload,
}: {
  folder: MediaFolder;
  previews: MediaFile[];
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  return (
    <Card
      size="sm"
      className="cursor-pointer transition hover:ring-[var(--cc-accent-primary)]"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <CardContent className="flex flex-col gap-3">
        <div className="grid aspect-[16/9] grid-cols-2 grid-rows-2 overflow-hidden rounded-lg bg-muted">
          {previews.length === 0 ? (
            <div className="col-span-2 row-span-2 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <FolderOpen className="size-8" />
              <span className="text-xs">No files yet</span>
            </div>
          ) : previews.length === 1 ? (
            <div className="col-span-2 row-span-2">
              <MediaThumb file={previews[0]} />
            </div>
          ) : (
            previews.map((file) => <MediaThumb key={file.id} file={file} />)
          )}
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{folder.name}</h3>
            <p className="text-xs text-muted-foreground">
              {folder.fileCount} file{folder.fileCount === 1 ? "" : "s"}
              {folder.photoCount ? ` · ${folder.photoCount} image${folder.photoCount === 1 ? "" : "s"}` : ""}
              {folder.videoCount ? ` · ${folder.videoCount} video${folder.videoCount === 1 ? "" : "s"}` : ""}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {folder.deviceSerialNumber ? `Drone ${folder.deviceSerialNumber}` : "Aircraft"}
              {folder.capturedAt ? ` · ${formatCapturedAt(folder.capturedAt)}` : ""}
            </p>
          </div>
          <StatusBadge variant={uploadStatusVariant(folder.mediaUploadStatus)}>
            {uploadStatusLabel(folder.mediaUploadStatus || folder.taskStatus)}
          </StatusBadge>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={downloading || folder.fileCount === 0}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDownload();
          }}
        >
          <Download />
          Download folder
        </Button>
      </CardContent>
    </Card>
  );
}

function FileCard({
  file,
  selected,
  downloading,
  onOpen,
  onToggle,
  onDownload,
}: {
  file: MediaFile;
  selected: boolean;
  downloading: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onDownload: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl bg-card text-left ring-1 ring-foreground/10 transition hover:ring-[var(--cc-accent-primary)]",
        selected && "ring-[var(--cc-accent-primary)]",
      )}
    >
      <button
        type="button"
        className={cn(
          "absolute top-2 left-2 z-10 flex size-6 items-center justify-center rounded-md border border-white/40 bg-black/45 text-white backdrop-blur-sm",
          selected && "border-transparent bg-[var(--cc-accent-primary)]",
        )}
        aria-label={selected ? "Deselect file" : "Select file"}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        {selected ? <Check className="size-3.5" /> : null}
      </button>
      <button
        type="button"
        className="absolute top-2 right-2 z-10 flex size-7 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur-sm"
        aria-label={`Download ${file.name}`}
        disabled={downloading}
        onClick={(event) => {
          event.stopPropagation();
          onDownload();
        }}
      >
        <Download className="size-3.5" />
      </button>
      <button type="button" className="block w-full text-left" onClick={onOpen}>
        <div className="aspect-[4/3]">
          <MediaThumb file={file} />
        </div>
        <div className="space-y-0.5 p-2.5">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatBytes(file.sizeBytes)} · {formatCapturedAt(file.capturedAt)}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {file.folderName || "Mission folder"}
            {file.deviceSerialNumber ? ` · ${file.deviceSerialNumber}` : ""}
          </p>
        </div>
      </button>
    </div>
  );
}
