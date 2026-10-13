/**
 * Project media synchronization and assignment checks.
 * Uses an in-memory store and a fake FlightHub client. It does not call DJI.
 *
 * Usage: npm run test:project-media
 */
import assert from "node:assert/strict";
import type { IFh2Client, Fh2LibraryMediaPage } from "../apps/api/src/infrastructure/fh2/types.js";
import type { SyncedFh2Project } from "../apps/api/src/modules/projects/application/fh2-projects.service.js";
import { mediaProjectsForRole } from "../apps/api/src/modules/media/application/media-access.js";
import {
  buildProjectMediaCatalog,
  createMemoryMediaStore,
  loadSyncedProjectCatalog,
  type StoredProjectMedia,
} from "../apps/api/src/modules/media/application/project-media-sync.service.js";

const PROJECT_1 = "11111111-1111-4111-8111-111111111111";
const PROJECT_2 = "22222222-2222-4222-8222-222222222222";
const PROJECT_3 = "33333333-3333-4333-8333-333333333333";

function project(id: string, name: string, localStatus: "active" | "inactive" = "active"): SyncedFh2Project {
  return {
    fh2ProjectId: id,
    fh2ProjectCode: id,
    projectName: name,
    fh2Status: "active",
    localStatus,
    source: "FH2",
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
  };
}

function ref(id: string, name: string) {
  return { projectId: id, projectCode: id, projectName: name };
}

function page(list: Fh2LibraryMediaPage["list"], total = list.length): Fh2LibraryMediaPage {
  return { list, pagination: { page: 1, page_size: list.length || 1, total } };
}

function fakeClient(handler: (params: {
  projectUuid: string;
  parentId?: number;
  page?: number;
  size?: number;
}) => Fh2LibraryMediaPage | Promise<Fh2LibraryMediaPage>): IFh2Client {
  return {
    async listProjectMediaFiles(params) {
      return handler(params);
    },
    async listProjectDevices() {
      return [];
    },
    async listTasks() {
      return [];
    },
    async getTaskMedia() {
      return [];
    },
  } as unknown as IFh2Client;
}

function stored(partial: Partial<StoredProjectMedia> & Pick<StoredProjectMedia, "id" | "projectId">): StoredProjectMedia {
  return {
    projectCode: partial.projectId,
    projectName: partial.projectName ?? partial.projectId,
    name: partial.name ?? partial.id,
    mediaType: partial.mediaType ?? "image",
    sizeBytes: partial.sizeBytes ?? 10,
    previewUrl: "",
    downloadUrl: "",
    capturedAt: partial.capturedAt ?? null,
    syncedAt: partial.syncedAt ?? "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

async function testAccessRules(): Promise<void> {
  const projects = [
    project(PROJECT_1, "Project 1"),
    project(PROJECT_2, "Project 2"),
    project(PROJECT_3, "Marafiq KAUST Test", "inactive"),
    project("44444444-4444-4444-8444-444444444444", "Future client"),
  ];

  const userA = mediaProjectsForRole("viewer", projects, [PROJECT_1]).map((item) => item.projectName);
  const userB = mediaProjectsForRole("viewer", projects, [PROJECT_1, PROJECT_2]).map((item) => item.projectName);
  const operator = mediaProjectsForRole("operator", projects, [], PROJECT_1).map((item) => item.projectName);
  const admin = mediaProjectsForRole("admin", projects, []).map((item) => item.projectName);

  assert.deepEqual(userA, ["Project 1"]);
  assert.deepEqual(userB, ["Project 1", "Project 2"]);
  assert.deepEqual(operator, ["Project 1"]);
  assert.equal(admin.includes("Project 1"), true);
  assert.equal(admin.includes("Project 2"), true);
  assert.equal(admin.includes("Future client"), true);
  assert.equal(admin.includes("Marafiq KAUST Test"), false);
  assert.equal(userA.includes("Project 2"), false);
  assert.equal(mediaProjectsForRole("viewer", projects, []).length, 0);
}

async function testSyncSortDedupeAndScope(): Promise<void> {
  const calls: string[] = [];
  let round = 0;
  const client = fakeClient((params) => {
    const pageNumber = params.page ?? 1;
    const pageSize = params.size ?? 1;
    calls.push(`${params.projectUuid}:${params.parentId ?? "root"}:${pageNumber}`);
    if (params.projectUuid === PROJECT_2) {
      return page([
        {
          id: 20,
          uuid: "p2-only",
          name: "Project2Only",
          file_type: 2,
          suffix: ".jpeg",
          size: 20,
          create_at: "2026-05-01T00:00:00Z",
          preview_url: "https://example.invalid/p2.jpg",
          original_url: "https://example.invalid/p2-full.jpg",
        },
      ]);
    }
    if (params.parentId == null || params.parentId === 0) {
      if (pageNumber === 1) round += 1;
      return {
        list: [
          {
            id: 10,
            uuid: "mission-folder",
            name: "DJI Dock 3-FLY-TO-2026-07-26 11:03:35 (UTC)",
            file_type: 1,
            create_at: "2026-07-26T11:03:35Z",
          },
        ],
        pagination: { page: pageNumber, page_size: pageSize, total: 1 },
      };
    }
    const children = [
      {
        id: 11,
        uuid: "existing-photo",
        name: round > 1 ? "ExistingPhotoRenamed" : "ExistingPhoto",
        file_type: 2 as const,
        suffix: ".jpeg",
        size: 100,
        create_at: "2026-06-22T09:51:58Z",
        preview_url: "https://example.invalid/old.jpg",
        original_url: "https://example.invalid/old-full.jpg",
        p_infos: { pid: 10, p_name: "DJI Dock 3-FLY-TO-2026-06-22 09:51:58 (UTC)" },
      },
      {
        id: 12,
        uuid: "new-video",
        name: "NewVideo",
        file_type: 3 as const,
        suffix: ".mp4",
        size: 500,
        create_at: "2026-07-26T11:03:35Z",
        preview_url: "",
        original_url: "https://example.invalid/new.mp4",
        p_infos: { pid: 10, p_name: "DJI Dock 3-FLY-TO-2026-07-26 11:03:35 (UTC)" },
      },
    ];
    const start = (pageNumber - 1) * pageSize;
    return {
      list: children.slice(start, start + pageSize),
      pagination: { page: pageNumber, page_size: pageSize, total: children.length },
    };
  });

  const store = createMemoryMediaStore();
  const projects = [ref(PROJECT_1, "Project 1"), ref(PROJECT_2, "Project 2")];
  const first = await loadSyncedProjectCatalog(client, projects, {
    store,
    force: true,
    pageSize: 1,
    retryDelayMs: 0,
  });

  assert.deepEqual(
    first.folders.map((folder) => folder.name),
    ["Project 1", "Project 2"],
  );
  const project1 = first.files.filter((file) => file.projectId === PROJECT_1);
  assert.deepEqual(
    project1.map((file) => file.name),
    ["NewVideo.mp4", "ExistingPhoto.jpeg"],
  );
  assert.equal(project1[0]?.capturedAt, "2026-07-26T11:03:35Z");
  assert.equal(first.files.some((file) => file.id === "p2-only" && file.projectName === "Project 2"), true);
  assert.equal(first.files.filter((file) => file.id === "existing-photo").length, 1);

  const userA = buildProjectMediaCatalog(
    [ref(PROJECT_1, "Project 1")],
    (await store.read()).files,
    [],
  );
  assert.equal(userA.files.some((file) => file.projectId === PROJECT_2), false);
  assert.equal(userA.files.find((file) => file.id === "p2-only"), undefined);
  assert.equal(userA.folders.length, 1);

  const second = await loadSyncedProjectCatalog(client, [ref(PROJECT_1, "Project 1")], {
    store,
    force: true,
    pageSize: 1,
    retryDelayMs: 0,
  });
  const photos = second.files.filter((file) => file.id === "existing-photo");
  assert.equal(photos.length, 1);
  assert.equal(photos[0]?.name, "ExistingPhotoRenamed.jpeg");
  const stillThere = (await store.read()).files.filter((file) => file.projectId === PROJECT_2);
  assert.equal(stillThere.length, 1);
  assert.ok(calls.some((call) => call.startsWith(`${PROJECT_1}:root:1`)));
  assert.ok(calls.some((call) => call.startsWith(`${PROJECT_1}:10:`)));
}

async function testCaptureTimeBeatsSyncTime(): Promise<void> {
  const catalog = buildProjectMediaCatalog(
    [ref(PROJECT_1, "Marafiq KAUST Test")],
    [
      stored({
        id: "older-capture",
        projectId: PROJECT_1,
        projectName: "Marafiq KAUST Test",
        name: "Older",
        capturedAt: "2026-06-01T00:00:00Z",
        syncedAt: "2026-10-13T12:00:00.000Z",
      }),
      stored({
        id: "newer-capture",
        projectId: PROJECT_1,
        projectName: "Marafiq KAUST Test",
        name: "Newer",
        mediaType: "video",
        capturedAt: "2026-07-26T11:03:35Z",
        syncedAt: "2026-07-26T11:04:00.000Z",
      }),
    ],
    [],
  );
  assert.deepEqual(
    catalog.files.map((file) => file.id),
    ["newer-capture", "older-capture"],
  );
  assert.equal(catalog.folders[0]?.name, "Marafiq KAUST Test");
}

async function testRetryAndFailedSyncKeepsRecords(): Promise<void> {
  let attempts = 0;
  const client = fakeClient(() => {
    attempts += 1;
    if (attempts < 3) throw new Error("FH2 HTTP 503: unavailable");
    return page([
      {
        uuid: "kept",
        name: "Kept",
        file_type: 2,
        suffix: ".jpeg",
        size: 5,
        create_at: "2026-07-01T00:00:00Z",
      },
    ]);
  });
  const store = createMemoryMediaStore();
  const catalog = await loadSyncedProjectCatalog(client, [ref(PROJECT_1, "Project 1")], {
    store,
    force: true,
    retryDelayMs: 0,
  });
  assert.equal(attempts, 3);
  assert.equal(catalog.files.length, 1);

  const failing = fakeClient(() => {
    throw new Error("FH2 HTTP 404: missing");
  });
  const afterFailure = await loadSyncedProjectCatalog(failing, [ref(PROJECT_1, "Project 1")], {
    store,
    force: true,
    retryDelayMs: 0,
  });
  assert.equal(afterFailure.files.length, 1);
  assert.equal(afterFailure.files[0]?.id, "kept");
  assert.match(afterFailure.hint ?? "", /could not be synchronized/);
}

async function testRemovedFileIsNotDuplicated(): Promise<void> {
  let pass = 0;
  const client = fakeClient(() => {
    pass += 1;
    const files = [
      {
        uuid: "stay",
        name: "Stay",
        file_type: 2,
        suffix: ".jpeg",
        size: 1,
        create_at: "2026-08-01T00:00:00Z",
      },
    ];
    if (pass === 1) {
      files.push({
        uuid: "gone",
        name: "Gone",
        file_type: 3,
        suffix: ".mp4",
        size: 2,
        create_at: "2026-08-02T00:00:00Z",
      });
    }
    return page(files);
  });
  const store = createMemoryMediaStore();
  const options = { store, force: true, retryDelayMs: 0 };
  await loadSyncedProjectCatalog(client, [ref(PROJECT_3, "New client project")], options);
  const second = await loadSyncedProjectCatalog(client, [ref(PROJECT_3, "New client project")], options);
  assert.deepEqual(
    second.files.map((file) => file.id),
    ["stay"],
  );
  assert.equal(second.folders[0]?.name, "New client project");
}

async function main(): Promise<void> {
  await testAccessRules();
  await testSyncSortDedupeAndScope();
  await testCaptureTimeBeatsSyncTime();
  await testRetryAndFailedSyncKeepsRecords();
  await testRemovedFileIsNotDuplicated();
  console.log("project media sync tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
