import { LiveFh2Client } from "../apps/api/src/infrastructure/fh2/live-adapter.js";
import { createMemoryMediaStore, loadSyncedProjectCatalog } from "../apps/api/src/modules/media/application/project-media-sync.service.js";

const projectId = "083c9116-70c6-4dc1-baff-ea4051971e15";

async function main(): Promise<void> {
  const catalog = await loadSyncedProjectCatalog(
    new LiveFh2Client(),
    [{ projectId, projectCode: projectId, projectName: "Marafiq Kaust Test" }],
    { store: createMemoryMediaStore(), force: true, retryDelayMs: 0 },
  );
  const folders = [...new Set(catalog.files.map((file) => file.taskName).filter(Boolean))];
  console.log(
    JSON.stringify({
      files: catalog.files.length,
      photos: catalog.files.filter((file) => file.mediaType === "image").length,
      videos: catalog.files.filter((file) => file.mediaType === "video").length,
      folders,
      hint: catalog.hint ?? null,
      sample: catalog.files.slice(0, 3).map((file) => ({
        name: file.name,
        type: file.mediaType,
        folder: file.taskName,
        capturedAt: file.capturedAt,
        hasPreview: Boolean(file.previewUrl),
      })),
    }),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message.slice(0, 400) : String(err));
  process.exit(1);
});
