import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createFh2Client } from "../../../../infrastructure/fh2/client.js";
import { flattenDevices } from "../../../../shared/normalize/normalize.service.js";
import {
  loadRecentTaskMedia,
  recentMediaMeta,
} from "../../application/recent-media.service.js";
import {
  filterCatalogFiles,
  findCatalogFile,
  loadMediaLibrary,
  type MediaCenterFile,
  type MediaLibraryCatalog,
} from "../../application/media-library.service.js";
import {
  archiveMediaFiles,
  fetchMediaBytes,
  MAX_ARCHIVE_FILES,
} from "../../application/media-zip.service.js";
import {
  registerViewerGet,
  publicDocsSchema,
} from "../../../../shared/http/viewer-paths.js";

const recentQuerySchema = z.object({
  sn: z.string().optional(),
  begin_at: z.coerce.number().optional(),
  end_at: z.coerce.number().optional(),
  task_limit: z.coerce.number().min(1).max(20).optional(),
  media_per_task: z.coerce.number().min(1).max(50).optional(),
});

const libraryQuerySchema = z.object({
  sn: z.string().optional(),
  begin_at: z.coerce.number().optional(),
  end_at: z.coerce.number().optional(),
  task_limit: z.coerce.number().min(1).max(50).optional(),
  media_per_task: z.coerce.number().min(1).max(200).optional(),
  q: z.string().optional(),
  kind: z.enum(["all", "image", "video"]).optional(),
  folderId: z.string().optional(),
  sort: z.enum(["newest", "oldest", "name", "size"]).optional(),
});

const archiveQuerySchema = z.object({
  ids: z.string().optional(),
  folderId: z.string().optional(),
  sn: z.string().optional(),
});

function defaultTimeRange(days: number): { beginAt: number; endAt: number } {
  const endAt = Math.floor(Date.now() / 1000);
  const beginAt = endAt - days * 24 * 60 * 60;
  return { beginAt, endAt };
}

async function resolveDevice(
  fh2: ReturnType<typeof createFh2Client>,
  sn?: string,
): Promise<{ deviceSn: string; dockLabel: string } | { error: string }> {
  const devices = flattenDevices(await fh2.listProjectDevices());
  let deviceSn = sn;
  let dockLabel = "DJI Dock 3";
  if (!deviceSn) {
    const dock = devices.find((d) => d.role === "gateway");
    deviceSn = dock?.serialNumber ?? devices[0]?.serialNumber;
    if (dock?.modelName) dockLabel = dock.modelName;
  } else {
    const match = devices.find((d) => d.serialNumber === deviceSn);
    if (match?.modelName) dockLabel = match.modelName;
  }
  if (!deviceSn) return { error: "No device SN provided and none found in project" };
  return { deviceSn, dockLabel };
}

export const mediaRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  async function loadCatalog(query: {
    sn?: string;
    begin_at?: number;
    end_at?: number;
    task_limit?: number;
    media_per_task?: number;
  }): Promise<MediaLibraryCatalog | { error: string; status: number }> {
    const range = defaultTimeRange(30);
    const resolved = await resolveDevice(fh2, query.sn);
    if ("error" in resolved) return { error: resolved.error, status: 400 };
    return loadMediaLibrary(fh2, {
      deviceSn: resolved.deviceSn,
      beginAt: query.begin_at ?? range.beginAt,
      endAt: query.end_at ?? range.endAt,
      taskLimit: query.task_limit,
      mediaPerTask: query.media_per_task,
      dockLabel: resolved.dockLabel,
    });
  }

  registerViewerGet(
    app,
    "/v1/media/recent",
    {
      schema: publicDocsSchema({
        summary: "Recent flight tasks with media file names",
        description:
          "Lists recent flight tasks and photo/video file names from each task's media library folder.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const parsed = recentQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      const range = defaultTimeRange(14);
      const resolved = await resolveDevice(fh2, parsed.data.sn);
      if ("error" in resolved) {
        return reply.status(400).send({ error: "no_device", message: resolved.error });
      }

      const result = await loadRecentTaskMedia(fh2, {
        deviceSn: resolved.deviceSn,
        beginAt: parsed.data.begin_at ?? range.beginAt,
        endAt: parsed.data.end_at ?? range.endAt,
        taskLimit: parsed.data.task_limit,
        mediaPerTask: parsed.data.media_per_task,
        dockLabel: resolved.dockLabel,
      });

      return reply.send({
        data: result.tasks,
        meta: recentMediaMeta(result),
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/media/library",
    {
      schema: publicDocsSchema({
        summary: "Media Center catalog (folders + files)",
        description:
          "Returns the FlightHub media library as mission folders and files for the Media Center. Files remain stored in DJI FlightHub 2; this endpoint exposes listing metadata, preview URLs, and download paths.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const parsed = libraryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const catalog = await loadCatalog(parsed.data);
      if ("error" in catalog) {
        return reply.status(catalog.status).send({ error: "no_device", message: catalog.error });
      }
      return reply.send({
        data: catalog,
        meta: {
          folderCount: catalog.folders.length,
          fileCount: catalog.files.length,
          source: "flighthub2",
          mediaApiBlocked: catalog.mediaApiBlocked,
          hint: catalog.hint,
        },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/media/folders",
    {
      schema: publicDocsSchema({
        summary: "Media folder tree",
        description:
          "Mission folders from FlightHub. Nested subfolders are not exposed by FlightHub OpenAPI; each mission maps to one folder.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const parsed = libraryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const catalog = await loadCatalog(parsed.data);
      if ("error" in catalog) {
        return reply.status(catalog.status).send({ error: "no_device", message: catalog.error });
      }
      return reply.send({
        data: { folders: catalog.folders, tree: catalog.tree },
        meta: {
          nestedFoldersSupported: false,
          source: "flighthub2",
        },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/media/folders/:id",
    {
      schema: publicDocsSchema({
        summary: "Media folder detail",
        description: "One mission folder and the media files inside it.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const catalog = await loadCatalog({});
      if ("error" in catalog) {
        return reply.status(catalog.status).send({ error: "no_device", message: catalog.error });
      }
      const folder = catalog.folders.find((row) => row.id === id);
      if (!folder) {
        return reply.status(404).send({ error: "not_found", message: "Media folder not found" });
      }
      const files = catalog.files.filter((file) => file.folderId === id);
      return reply.send({
        data: { folder, files },
        meta: { count: files.length, source: "flighthub2" },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/media/files",
    {
      schema: publicDocsSchema({
        summary: "Search and filter Media Center files",
        description:
          "Flat listing of photos and videos with search (q), kind (image|video), folderId, and sort.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const parsed = libraryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const catalog = await loadCatalog(parsed.data);
      if ("error" in catalog) {
        return reply.status(catalog.status).send({ error: "no_device", message: catalog.error });
      }
      const files = filterCatalogFiles(catalog, {
        q: parsed.data.q,
        kind: parsed.data.kind,
        folderId: parsed.data.folderId,
        sort: parsed.data.sort,
      });
      return reply.send({
        data: files,
        meta: { count: files.length, source: "flighthub2" },
      });
    },
  );

  registerViewerGet(
    app,
    "/v1/media/files/:id",
    {
      schema: publicDocsSchema({
        summary: "Media file details",
        description:
          "Returns one file's metadata, preview URL, original download URL, and a stable Shamal download path. Optional taskId query avoids scanning other missions.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const taskId =
        typeof (request.query as { taskId?: string }).taskId === "string"
          ? (request.query as { taskId?: string }).taskId
          : undefined;
      const catalog = await loadCatalog({});
      if ("error" in catalog) {
        return reply.status(catalog.status).send({ error: "no_device", message: catalog.error });
      }
      const file = taskId
        ? catalog.files.find((row) => row.id === id && row.taskId === taskId)
        : findCatalogFile(catalog, id);
      if (!file) {
        return reply.status(404).send({ error: "not_found", message: "Media file not found" });
      }
      return reply.send({ data: file, meta: { source: "flighthub2" } });
    },
  );

  registerViewerGet(
    app,
    "/v1/media/files/:id/download",
    {
      schema: publicDocsSchema({
        summary: "Download a media file",
        description:
          "Proxies the current FlightHub original/preview bytes with Content-Disposition attachment so clients can download without signed-URL CORS issues.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const catalog = await loadCatalog({});
      if ("error" in catalog) {
        return reply.status(catalog.status).send({ error: "no_device", message: catalog.error });
      }
      const file = findCatalogFile(catalog, id);
      if (!file) {
        return reply.status(404).send({ error: "not_found", message: "Media file not found" });
      }
      const fetched = await fetchMediaBytes(file);
      if (!fetched) {
        return reply.status(502).send({
          error: "download_unavailable",
          message: "FlightHub did not return file bytes for this media item. Refresh the Media Center and try again.",
        });
      }
      reply.header("Content-Type", fetched.contentType);
      reply.header(
        "Content-Disposition",
        `attachment; filename="${file.name.replaceAll('"', "")}"`,
      );
      return reply.send(fetched.data);
    },
  );

  registerViewerGet(
    app,
    "/v1/media/archive",
    {
      schema: publicDocsSchema({
        summary: "Bulk-download media as a ZIP",
        description:
          `Download selected files (ids=comma-separated, max ${MAX_ARCHIVE_FILES}) or an entire mission folder (folderId=task UUID) as a ZIP. Files are fetched from FlightHub and packaged by Shamal.`,
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const parsed = archiveQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const catalog = await loadCatalog({ sn: parsed.data.sn });
      if ("error" in catalog) {
        return reply.status(catalog.status).send({ error: "no_device", message: catalog.error });
      }

      let selected: MediaCenterFile[] = [];
      if (parsed.data.ids) {
        const idSet = new Set(
          parsed.data.ids
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, MAX_ARCHIVE_FILES),
        );
        selected = catalog.files.filter((file) => idSet.has(file.id));
      } else if (parsed.data.folderId) {
        selected = catalog.files
          .filter((file) => file.folderId === parsed.data.folderId)
          .slice(0, MAX_ARCHIVE_FILES);
      }

      if (selected.length === 0) {
        return reply.status(400).send({
          error: "no_files",
          message: "Provide ids (comma-separated file IDs) or folderId for a mission folder.",
        });
      }

      try {
        const archive = await archiveMediaFiles(selected);
        reply.header("Content-Type", "application/zip");
        reply.header(
          "Content-Disposition",
          `attachment; filename="${archive.fileName}"`,
        );
        reply.header("X-Shamal-Archive-Included", String(archive.included));
        reply.header("X-Shamal-Archive-Skipped", String(archive.skipped));
        return reply.send(archive.zip);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Archive failed";
        return reply.status(502).send({ error: "archive_unavailable", message });
      }
    },
  );
};
