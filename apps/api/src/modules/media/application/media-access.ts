import type { SyncedFh2Project } from "../../projects/application/fh2-projects.service.js";
import {
  listFh2Projects,
  listViewerAssignedProjectIds,
  resolveFallbackProjectCode,
} from "../../projects/application/fh2-projects.service.js";

export type MediaAccessRole = "admin" | "operator" | "viewer" | undefined;

export interface MediaProjectRef {
  projectId: string;
  projectCode: string;
  projectName: string;
}

export function mediaProjectsForRole(
  role: MediaAccessRole,
  projects: SyncedFh2Project[],
  assignedProjectIds: string[],
  fallbackProjectCode?: string,
): SyncedFh2Project[] {
  const active = projects.filter((project) => project.localStatus === "active");
  if (role === "admin") return active;
  const allowed = new Set(assignedProjectIds);
  const assigned = active.filter((project) => allowed.has(project.fh2ProjectId));
  if (assigned.length > 0 || role !== "operator" || !fallbackProjectCode) return assigned;
  return active.filter(
    (project) =>
      project.fh2ProjectId === fallbackProjectCode || project.fh2ProjectCode === fallbackProjectCode,
  );
}

export function listMediaProjectsForUser(
  role: MediaAccessRole,
  username: string,
): SyncedFh2Project[] {
  return mediaProjectsForRole(
    role,
    listFh2Projects(),
    listViewerAssignedProjectIds(username),
    resolveFallbackProjectCode(),
  );
}

export function toMediaProjectRef(project: SyncedFh2Project): MediaProjectRef {
  return {
    projectId: project.fh2ProjectId,
    projectCode: project.fh2ProjectCode,
    projectName: project.projectName,
  };
}

export function requestedProjectAllowed(
  requested: string | undefined,
  projects: SyncedFh2Project[],
): boolean {
  if (!requested) return true;
  return projects.some(
    (project) => project.fh2ProjectId === requested || project.fh2ProjectCode === requested,
  );
}
