import type {
  SharedProjectAssetReference,
  SharedProjectLoadResponse,
  SharedProjectSnapshotSummary
} from "@webster/shared";

export type SharedProjectAssetUpload = {
  assetId?: string;
  assetPath: string;
  blob: Blob;
  mimeType?: string;
};

type CreateSnapshotInput = {
  message?: string | null;
  projectId: string;
};

const defaultApiBaseUrl = "/api";

let _getToken: (() => Promise<string>) | null = null;

export function setAccessTokenGetter(fn: () => Promise<string>) {
  _getToken = fn;
}

/** BUG 3 fix: exported helper so useCollaboration can fetch a token before connecting. */
export async function getAccessToken(): Promise<string | null> {
  return _getToken ? _getToken() : null;
}

export function getSharedProjectApiBaseUrl() {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_WEBSTER_API_URL ?? defaultApiBaseUrl);
}

export function getSharedProjectWebSocketUrl(_projectId: string) {
  // BUG 2 fix: socket.io-client interprets the URL path as a namespace.
  // The gateway uses the default "/" namespace, so we must pass the host
  // origin only — no path component. Room joining happens via project:join.
  if (process.env.NEXT_PUBLIC_WEBSTER_WS_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_WEBSTER_WS_URL);
  }

  if (typeof window === "undefined") {
    return "http://localhost:4000";
  }

  return window.location.origin;
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
  // BUG 4 fix: include Authorization header so JwtAuthGuard accepts the request.
  const response = await authedFetch(
    `${getSharedProjectApiBaseUrl()}/shared-projects/${encodeURIComponent(projectId)}/export-webster`
  );

  if (!response.ok) {
    throw new Error(await readApiError(response, "Unable to download shared project."));
  }

  return response.blob();
}

/**
 * Uploads binary assets introduced while already in shared mode. The socket
 * operation carries only asset references plus the scene manifest; the backend
 * stores these blobs and returns download URLs other clients can fetch.
 */
export async function uploadSharedProjectAssets(
  projectId: string,
  uploads: SharedProjectAssetUpload[]
) {
  if (uploads.length === 0) {
    return [] satisfies SharedProjectAssetReference[];
  }

  const formData = new FormData();
  const metadata = uploads.map((upload, index) => ({
    assetId: upload.assetId,
    assetPath: upload.assetPath,
    fileField: `asset-${index}`,
    mimeType: upload.mimeType || upload.blob.type || "application/octet-stream"
  }));

  formData.append("metadata", JSON.stringify({ assets: metadata }));

  uploads.forEach((upload, index) => {
    const fileField = `asset-${index}`;

    formData.append(fileField, upload.blob, getAssetFilename(upload.assetPath));
  });

  const response = await fetchJson<{ assets?: SharedProjectAssetReference[] }>(
    `/shared-projects/${encodeURIComponent(projectId)}/assets`,
    {
      body: formData,
      method: "POST"
    }
  );

  return response.assets?.length
    ? response.assets
    : metadata.map((asset) => ({
        assetId: asset.assetId,
        assetPath: asset.assetPath,
        downloadUrl: getDefaultAssetDownloadUrl(projectId, asset.assetPath),
        mimeType: asset.mimeType
      }));
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

export type UserProfile = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getCurrentUser() {
  return fetchJson<UserProfile>("/users/me");
}

export async function updateCurrentUser(updates: { displayName?: string }) {
  return fetchJson<UserProfile>("/users/me", {
    body: JSON.stringify(updates),
    headers: { "Content-Type": "application/json" },
    method: "PATCH"
  });
}

export async function uploadAvatar(file: Blob, filename = "avatar") {
  const formData = new FormData();
  formData.append("file", file, filename);

  return fetchJson<UserProfile>("/users/me/avatar", {
    body: formData,
    method: "POST"
  });
}

export async function removeAvatar() {
  return fetchJson<UserProfile>("/users/me/avatar", { method: "DELETE" });
}

/** Turns a relative avatarUrl (e.g. /users/<id>/avatar?v=...) into an absolute URL. */
export function toAbsoluteAvatarUrl(avatarUrl: string | null | undefined) {
  if (!avatarUrl) {
    return null;
  }
  if (/^https?:\/\//iu.test(avatarUrl)) {
    return avatarUrl;
  }
  return `${getSharedProjectApiBaseUrl()}${avatarUrl.startsWith("/") ? "" : "/"}${avatarUrl}`;
}

export type ProjectSummary = {
  id: string;
  projectName: string;
  mimeType: string;
  sizeBytes: string;
  updatedAt: string;
  role: "owner" | "editor" | "viewer";
};

export async function listProjects() {
  return fetchJson<{ projects: ProjectSummary[] }>("/projects");
}

export type ProjectAccessPermission = 'viewer' | 'editor' | 'commenter';

export type ProjectAccessEntry = {
  id: string;
  permission: ProjectAccessPermission;
  expiresAt: string | null;
  sharedWithUser: { id: string; email: string; displayName: string | null } | null;
};

export async function listProjectAccesses(projectId: string) {
  return fetchJson<{ accesses: ProjectAccessEntry[] }>(
    `/projects/${encodeURIComponent(projectId)}/accesses`
  );
}

export async function grantProjectAccess(
  projectId: string,
  email: string,
  permission: ProjectAccessPermission
) {
  return fetchJson<ProjectAccessEntry>(`/projects/${encodeURIComponent(projectId)}/accesses`, {
    body: JSON.stringify({ email, permission }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
}

export async function revokeProjectAccess(projectId: string, accessId: string) {
  const response = await authedFetch(
    `${getSharedProjectApiBaseUrl()}/projects/${encodeURIComponent(projectId)}/accesses/${encodeURIComponent(accessId)}`,
    { method: "DELETE" }
  );

  if (!response.ok && response.status !== 204) {
    throw new Error(await readApiError(response, "Unable to revoke access."));
  }
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
      // BUG 4 fix: include Authorization header so JwtAuthGuard accepts the request.
      const response = await authedFetch(toAbsoluteAssetUrl(asset.downloadUrl));

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

/** BUG 4 fix: authenticated fetch — adds Bearer header the same way fetchJson does. */
async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};

  if (_getToken) {
    headers["Authorization"] = "Bearer " + (await _getToken());
  }

  return fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) }
  });
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};

  if (_getToken) {
    headers["Authorization"] = "Bearer " + (await _getToken());
  }

  const mergedInit: RequestInit = {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) }
  };

  const response = await fetch(`${getSharedProjectApiBaseUrl()}${path}`, mergedInit);

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

function getAssetFilename(assetPath: string) {
  return assetPath.split("/").filter(Boolean).at(-1) || "asset";
}

function getDefaultAssetDownloadUrl(projectId: string, assetPath: string) {
  return `/shared-projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetPath)}`;
}
