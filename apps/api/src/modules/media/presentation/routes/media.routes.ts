import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { createFh2Client } from "../../../../infrastructure/fh2/client.js";
import { flattenDevices } from "../../../../shared/normalize/normalize.service.js";
import {
  loadRecentTaskMedia,
  recentMediaMeta,
} from "../../application/recent-media.service.js";
import {
  filterCatalogFiles,
  type MediaCenterFile,
  type MediaLibraryCatalog,
} from "../../application/media-library.service.js";
import {
  listMediaProjectsForUser,
  requestedProjectAllowed,
  toMediaProjectRef,
  type MediaAccessRole,
} from "../../application/media-access.js";
import { loadSyncedProjectCatalog } from "../../application/project-media-sync.service.js";
import { refreshFh2ProjectsStore } from "../../../projects/application/fh2-projects.service.js";
import {
  archiveMediaFiles,
  fetchMediaBytes,
  MAX_ARCHIVE_FILES,
} from "../../application/media-zip.service.js";
import {
  publicDocsSchema,
  registerViewerGet,
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
  refresh: z.string().optional(),
  projectId: z.string().optional(),
  projectCode: z.string().optional(),
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

    function requestRole(request: FastifyRequest): MediaAccessRole {
    const role = request.ccRole;
    if (role === "admin" || role === "operator" || role === "viewer") return role;
    return undefined;
  }

  function requestedProject(request: FastifyRequest): string | undefined {
    const query = request.query as { projectId?: string; projectCode?: string };
    return query.projectId?.trim() || query.projectCode?.trim() || undefined;
  }

  async function loadCatalog(
    request: FastifyRequest,
    options?: { force?: boolean },
  ): Promise<MediaLibraryCatalog | { error: string; status: number }> {
    await refreshFh2ProjectsStore();
    const role = requestRole(request);
    const projects = listMediaProjectsForUser(role, request.ccUsername ?? "");
    const requested = requestedProject(request);
    if (role !== "admin" && requested && !requestedProjectAllowed(requested, projects)) {
      return {
        error: "Selected FH2 project is not assigned to this account.",
        status: 403,
      };
    }
    if (role !== "admin" && projects.length === 0) {
      return { error: "No project assigned. Please contact your admin.", status: 403 };
    }
    const refresh = (request.query as { refresh?: string }).refresh;
    return loadSyncedProjectCatalog(
      fh2,
      projects.map(toMediaProjectRef),
      { force: options?.force === true || refresh === "1" || refresh === "true" },
    );
  }

  function sendCatalogError(
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
    catalog: { error: string; status: number },
  ) {
    const code = catalog.status === 403 ? "forbidden" : "media_unavailable";
    return reply.status(catalog.status).send({ error: code, message: catalog.error });
  }

  function findAuthorizedFile(
    catalog: MediaLibraryCatalog,
    fileId: string,
    projectId?: string,
  ): MediaCenterFile | undefined {
    return catalog.files.find((file) => {
      if (file.id !== fileId) return false;
      if (projectId && file.projectId && file.projectId !== projectId) return false;
      return true;
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
          "Returns the FlightHub media library as mission folders and files for the Media Center.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const parsed = libraryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const catalog = await loadCatalog(request, {
        force: parsed.data.refresh === "1" || parsed.data.refresh === "true",
      });
      if ("error" in catalog) {
        return sendCatalogError(reply, catalog);
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
          "Mission folders from FlightHub. Nested subfolders are not exposed by FlightHub OpenAPI.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const parsed = libraryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const catalog = await loadCatalog(request, {
        force: parsed.data.refresh === "1" || parsed.data.refresh === "true",
      });
      if ("error" in catalog) {
        return sendCatalogError(reply, catalog);
      }
      return reply.send({
        data: { folders: catalog.folders, tree: catalog.tree },
        meta: { nestedFoldersSupported: false, source: "flighthub2" },
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
      const catalog = await loadCatalog(request);
      if ("error" in catalog) {
        return sendCatalogError(reply, catalog);
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
        description: "Flat listing of photos and videos with search, kind, folderId, and sort.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const parsed = libraryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const catalog = await loadCatalog(request, {
        force: parsed.data.refresh === "1" || parsed.data.refresh === "true",
      });
      if ("error" in catalog) {
        return sendCatalogError(reply, catalog);
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
        description: "Returns metadata, preview URL, original download URL, and a Shamal download path.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const projectId =
        typeof (request.query as { projectId?: string }).projectId === "string"
          ? (request.query as { projectId?: string }).projectId
          : undefined;
      const catalog = await loadCatalog(request);
      if ("error" in catalog) {
        return sendCatalogError(reply, catalog);
      }
      const file = findAuthorizedFile(catalog, id, projectId);
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
          "Proxies FlightHub original/preview bytes with Content-Disposition attachment.",
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const projectId =
        typeof (request.query as { projectId?: string }).projectId === "string"
          ? (request.query as { projectId?: string }).projectId
          : undefined;
      const catalog = await loadCatalog(request);
      if ("error" in catalog) {
        return sendCatalogError(reply, catalog);
      }
      let file = findAuthorizedFile(catalog, id, projectId);
      if (!file) {
        return reply.status(404).send({ error: "not_found", message: "Media file not found" });
      }
      let fetched = await fetchMediaBytes(file);
      if (!fetched) {
        const refreshed = await loadCatalog(request, { force: true });
        if (!("error" in refreshed)) {
          const again = findAuthorizedFile(refreshed, id, file.projectId ?? projectId);
          if (again) {
            file = again;
            fetched = await fetchMediaBytes(again);
          }
        }
      }
      if (!fetched) {
        return reply.status(502).send({
          error: "download_unavailable",
          message: "FlightHub did not return file bytes for this media item.",
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
        description: `Download selected files (ids=, max ${MAX_ARCHIVE_FILES}) or a mission folder (folderId=) as a ZIP.`,
        tags: ["Media"],
      }),
    },
    async (request, reply) => {
      const parsed = archiveQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const catalog = await loadCatalog(request);
      if ("error" in catalog) {
        return sendCatalogError(reply, catalog);
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
        reply.header("Content-Disposition", `attachment; filename="${archive.fileName}"`);
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
