/**
 * Tracks recently-OPENED shared projects in localStorage. The server only
 * records `updatedAt` (edit time), which isn't the same as "last opened", so
 * we keep open-time locally per browser.
 */

const STORAGE_KEY = "webster:recent-shared-projects";
const MAX_ENTRIES = 50;

export type RecentSharedProject = {
  projectId: string;
  projectName: string;
  openedAt: number;
};

function readAll(): RecentSharedProject[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is RecentSharedProject =>
        !!entry &&
        typeof entry.projectId === "string" &&
        typeof entry.projectName === "string" &&
        typeof entry.openedAt === "number"
    );
  } catch {
    return [];
  }
}

export function recordOpenedProject(projectId: string, projectName: string) {
  if (typeof window === "undefined" || !projectId) {
    return;
  }

  const existing = readAll().filter((entry) => entry.projectId !== projectId);
  const next: RecentSharedProject[] = [
    { projectId, projectName, openedAt: Date.now() },
    ...existing
  ].slice(0, MAX_ENTRIES);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage full / unavailable — non-fatal
  }
}

export function listRecentlyOpenedProjects(limit = 10): RecentSharedProject[] {
  return readAll()
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, limit);
}
