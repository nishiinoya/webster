import type {
  SharedProjectAssetReference,
  SharedProjectLoadResponse,
  SharedProjectSnapshotSummary
} from "@webster/shared";

type CreateSnapshotInput = {
  message?: string | null;
  projectId: string;
};

const defaultApiBaseUrl = "/api";

export function getSharedProjectApiBaseUrl() {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_WEBSTER_API_URL ?? defaultApiBaseUrl);
}

export function getSharedProjectWebSocketUrl(projectId: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_WEBSTER_WS_URL;

  if (configuredUrl) {
    return appendProjectId(configuredUrl, projectId);
  }

  if (typeof window === "undefined") {
    return `ws://localhost:3000/ws/projects/${encodeURIComponent(projectId)}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.host}/ws/projects/${encodeURIComponent(projectId)}`;
}

/**
 * Uploads a normal `.webster` package through REST when a local project becomes
 * shared. The backend owns decomposing the package, extracting big assets, and
 * creating the first project snapshot from manifest.json.
 */
export async function uploadLocalWebsterProject(file: Blob, filename: string) {
  const formData = new FormData();

  formData.append("file", file, filename);

  return fetchJson<SharedProjectLoadResponse>("/shared-projects/import-webster", {
    body: formData,
    method: "POST"
  });
}

export async function loadSharedProject(projectId: string) {
  return fetchJson<SharedProjectLoadResponse>(
    `/shared-projects/${encodeURIComponent(projectId)}`
  );
}

/**
 * Downloads a server-packed `.webster` file through REST. WebSocket is only for
 * realtime operations and never carries project archives or binary assets.
 */
export async function downloadSharedProjectFile(projectId: string) {
  const response = await fetch(
    `${getSharedProjectApiBaseUrl()}/shared-projects/${encodeURIComponent(projectId)}/export-webster`
  );

  if (!response.ok) {
    throw new Error(await readApiError(response, "Unable to download shared project."));
  }

  return response.blob();
}

export async function listProjectSnapshots(projectId: string) {
  return fetchJson<{ snapshots: SharedProjectSnapshotSummary[] }>(
    `/shared-projects/${encodeURIComponent(projectId)}/snapshots`
  );
}

/**
 * Manual snapshots are checkpoints for loading/history. Commits remain the
 * autosave path, so the user does not need to create a snapshot after every edit.
 */
export async function createProjectSnapshot({ message, projectId }: CreateSnapshotInput) {
  return fetchJson<{ snapshot: SharedProjectSnapshotSummary }>(
    `/shared-projects/${encodeURIComponent(projectId)}/snapshots`,
    {
      body: JSON.stringify({ message: message?.trim() || null }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }
  );
}

export async function restoreProjectSnapshot(projectId: string, snapshotId: string) {
  return fetchJson<SharedProjectLoadResponse>(
    `/shared-projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
    {
      method: "POST"
    }
  );
}

export async function fetchSharedProjectAssets(
  references: SharedProjectAssetReference[] = []
) {
  const assets = new Map<string, Blob>();

  await Promise.all(
    references.map(async (asset) => {
      const response = await fetch(toAbsoluteAssetUrl(asset.downloadUrl));

      if (!response.ok) {
        throw new Error(`Unable to load project asset: ${asset.assetPath}`);
      }

      const blob = await response.blob();

      assets.set(asset.assetPath, blob);

      if (asset.assetId) {
        assets.set(asset.assetId, blob);
      }
    })
  );

  return assets;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getSharedProjectApiBaseUrl()}${path}`, init);

  if (!response.ok) {
    throw new Error(await readApiError(response, "Shared project request failed."));
  }

  return response.json() as Promise<T>;
}

async function readApiError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: unknown };

    return typeof payload.message === "string" ? payload.message : fallback;
  } catch {
    return fallback;
  }
}

function toAbsoluteAssetUrl(url: string) {
  if (/^https?:\/\//iu.test(url) || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }

  return `${getSharedProjectApiBaseUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

function appendProjectId(url: string, projectId: string) {
  const trimmedUrl = trimTrailingSlash(url);

  return trimmedUrl.includes("{projectId}")
    ? trimmedUrl.replace("{projectId}", encodeURIComponent(projectId))
    : `${trimmedUrl}/${encodeURIComponent(projectId)}`;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/u, "");
}
