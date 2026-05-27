import type {
  ProjectComment,
  SharedProjectAssetReference,
  SharedProjectLoadResponse,
  SharedProjectSnapshotSummary,
  WebsterProjectManifest
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

let _getToken: (() => Promise<string | null>) | null = null;

export function setAccessTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

export async function getAccessToken(): Promise<string | null> {
  return _getToken ? _getToken() : null;
}

export function getSharedProjectApiBaseUrl() {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_WEBSTER_API_URL ?? defaultApiBaseUrl);
}

export function getSharedProjectWebSocketUrl(_projectId: string) {
  if (process.env.NEXT_PUBLIC_WEBSTER_WS_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_WEBSTER_WS_URL);
  }

  if (typeof window === "undefined") {
    return "http://localhost:4000";
  }

  return window.location.origin;
}

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

export async function loadPublicViewerProject(projectId: string) {
  return fetchJson<SharedProjectLoadResponse>(
    `/shared-projects/${encodeURIComponent(projectId)}/public`,
    undefined,
    { auth: false }
  );
}

export async function loadPublicViewerInvite(token: string) {
  return fetchJson<SharedProjectLoadResponse>(
    `/shared-projects/public-invite/${encodeURIComponent(token)}`,
    undefined,
    { auth: false }
  );
}

export async function saveSharedProject(
  projectId: string,
  input: {
    assetReferences?: SharedProjectAssetReference[];
    baseVersion: number;
    clientId: string;
    manifest: WebsterProjectManifest;
  }
) {
  return fetchJson<SharedProjectLoadResponse>(
    `/shared-projects/${encodeURIComponent(projectId)}/save`,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }
  );
}

export async function downloadSharedProjectFile(projectId: string) {
  const response = await authedFetch(
    `${getSharedProjectApiBaseUrl()}/shared-projects/${encodeURIComponent(projectId)}/export-webster`
  );

  if (!response.ok) {
    throw await toApiError(response, "Unable to download shared project.");
  }

  return response.blob();
}

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

export async function resendEmailVerification() {
  return fetchJson<{ ok: true }>("/users/me/resend-verification", {
    method: "POST"
  });
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

export function toAbsoluteAvatarUrl(avatarUrl: string | null | undefined) {
  if (!avatarUrl) {
    return null;
  }
  if (/^https?:\/\//iu.test(avatarUrl)) {
    return avatarUrl;
  }
  return `${getSharedProjectApiBaseUrl()}${avatarUrl.startsWith("/") ? "" : "/"}${avatarUrl}`;
}

export type SubscriptionInfo = {
  plan: "free" | "pro";
  isPro: boolean;
  status: "active" | "canceled" | "past_due" | "trialing" | null;
  currentPeriodEnd: string | null;
  limits: {
    maxProjects: number | null;
    maxSharesPerProject: number | null;
    allow3D: boolean;
  };
  usage: {
    projectCount: number;
  };
};

export type SubscriptionPlan = {
  priceId: string;
  interval: "month" | "year";
  amount: number;
  currency: string;
  productName: string | null;
};

export type PaymentRecord = {
  id: string;
  amount: string;
  currency: string;
  providerTxId: string;
  createdAt: string;
};

export async function getMySubscription() {
  return fetchJson<SubscriptionInfo>("/subscriptions/me");
}

export async function listSubscriptionPlans() {
  return fetchJson<{ plans: SubscriptionPlan[] }>("/subscriptions/plans");
}

export async function startCheckout(priceId: string, successUrl: string, cancelUrl: string) {
  return fetchJson<{ url: string }>("/subscriptions/checkout", {
    body: JSON.stringify({ priceId, successUrl, cancelUrl }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
}

export async function openBillingPortal(returnUrl: string) {
  return fetchJson<{ url: string }>("/subscriptions/portal", {
    body: JSON.stringify({ returnUrl }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
}

export async function listPayments() {
  return fetchJson<{ payments: PaymentRecord[] }>("/payments");
}

export type ProjectSummary = {
  id: string;
  projectName: string;
  updatedAt: string;
  role: "owner" | "editor" | "viewer" | "commenter";
  owner?: {
    id: string;
    email: string;
    displayName: string | null;
  };
};

export type ProjectInviteSummary = {
  id: string;
  projectId: string;
  projectName: string;
  invitedEmail: string | null;
  invitedByUser: {
    id: string;
    email: string;
    displayName: string | null;
  };
  permission: ProjectAccessPermission;
  expiresAt: string | null;
  createdAt: string;
};

export async function listProjects() {
  return fetchJson<{
    owned: ProjectSummary[];
    sharedWithMe: ProjectSummary[];
    pendingInvites: ProjectInviteSummary[];
  }>("/projects");
}

export async function deleteProject(projectId: string) {
  const response = await authedFetch(
    `${getSharedProjectApiBaseUrl()}/projects/${encodeURIComponent(projectId)}`,
    { method: "DELETE" }
  );

  if (!response.ok && response.status !== 204) {
    throw await toApiError(response, "Unable to delete project.");
  }
}

export type ProjectAccessPermission = 'viewer' | 'editor' | 'commenter';

export type ProjectAccessEntry = {
  id: string;
  permission: ProjectAccessPermission;
  expiresAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  revokedAt?: string | null;
  sharedWithUser: { id: string; email: string; displayName: string | null } | null;
};

export type ProjectPendingInviteEntry = {
  id: string;
  invitedEmail: string | null;
  invitedByUser: { id: string; email: string; displayName: string | null };
  permission: ProjectAccessPermission;
  expiresAt: string | null;
  createdAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
};

export type ProjectLinkAccess = {
  hasInviteLink?: boolean;
  inviteLink?: string | null;
  mode: "restricted" | "anyone_with_link";
  permission: ProjectAccessPermission;
  updatedAt: string | null;
};

export async function listProjectAccesses(projectId: string) {
  return fetchJson<{
    owner: { id: string; email: string; displayName: string | null };
    accesses: ProjectAccessEntry[];
    pendingInvites: ProjectPendingInviteEntry[];
    removedAccesses: ProjectAccessEntry[];
    linkAccess: ProjectLinkAccess;
  }>(
    `/projects/${encodeURIComponent(projectId)}/accesses`
  );
}

export async function grantProjectAccess(
  projectId: string,
  email: string,
  permission: ProjectAccessPermission
) {
  return fetchJson<{
    access: ProjectAccessEntry | null;
    invite: ProjectPendingInviteEntry | null;
    inviteLink: string | null;
  }>(`/projects/${encodeURIComponent(projectId)}/accesses`, {
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
    throw await toApiError(response, "Unable to revoke access.");
  }
}

export async function revokeProjectInvite(projectId: string, inviteId: string) {
  const response = await authedFetch(
    `${getSharedProjectApiBaseUrl()}/projects/${encodeURIComponent(projectId)}/accesses/invites/${encodeURIComponent(inviteId)}`,
    { method: "DELETE" }
  );

  if (!response.ok && response.status !== 204) {
    throw await toApiError(response, "Unable to revoke invite.");
  }
}

export async function updateProjectAccess(
  projectId: string,
  accessId: string,
  input: { expiresAt?: string | null; permission?: ProjectAccessPermission }
) {
  return fetchJson<ProjectAccessEntry>(
    `/projects/${encodeURIComponent(projectId)}/accesses/${encodeURIComponent(accessId)}`,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    }
  );
}

export async function updateProjectInvite(
  projectId: string,
  inviteId: string,
  input: { expiresAt?: string | null; permission?: ProjectAccessPermission }
) {
  return fetchJson<ProjectPendingInviteEntry>(
    `/projects/${encodeURIComponent(projectId)}/accesses/invites/${encodeURIComponent(inviteId)}`,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    }
  );
}

export async function updateProjectLinkAccess(
  projectId: string,
  input: { mode: ProjectLinkAccess["mode"]; permission: ProjectAccessPermission }
) {
  return fetchJson<{ linkAccess: ProjectLinkAccess; inviteLink: string | null }>(
    `/projects/${encodeURIComponent(projectId)}/accesses/link-access`,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    }
  );
}

export async function resetProjectLinkAccess(projectId: string) {
  return fetchJson<{ linkAccess: ProjectLinkAccess; inviteLink: string | null }>(
    `/projects/${encodeURIComponent(projectId)}/accesses/link-access/reset`,
    { method: "POST" }
  );
}

export async function acceptProjectInvite(token: string) {
  return fetchJson<{ projectId: string; projectName: string; role: ProjectAccessPermission }>(
    "/invites/accept",
    {
      body: JSON.stringify({ token }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }
  );
}

export async function acceptPendingProjectInvite(inviteId: string) {
  return fetchJson<{ projectId: string; projectName: string; role: ProjectAccessPermission }>(
    `/projects/invites/${encodeURIComponent(inviteId)}/accept`,
    { method: "POST" }
  );
}

export async function listProjectComments(projectId: string) {
  return fetchJson<{ comments: ProjectComment[] }>(
    `/projects/${encodeURIComponent(projectId)}/comments`
  );
}

export async function createProjectComment(
  projectId: string,
  input: {
    content: string;
    layerId?: string | null;
    localX?: number | null;
    localY?: number | null;
    parentCommentId?: string | null;
    x?: number | null;
    y?: number | null;
  }
) {
  return fetchJson<ProjectComment>(`/projects/${encodeURIComponent(projectId)}/comments`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
}

export async function updateProjectComment(
  projectId: string,
  commentId: string,
  input: { text?: string; content?: string; isResolved?: boolean }
) {
  return fetchJson<ProjectComment>(
    `/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}`,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    }
  );
}

export async function deleteProjectComment(projectId: string, commentId: string) {
  const response = await authedFetch(
    `${getSharedProjectApiBaseUrl()}/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" }
  );

  if (!response.ok && response.status !== 204) {
    throw await toApiError(response, "Unable to delete comment.");
  }
}

export async function resolveProjectComment(projectId: string, commentId: string) {
  return fetchJson<ProjectComment>(
    `/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/resolve`,
    { method: "POST" }
  );
}

export async function reopenProjectComment(projectId: string, commentId: string) {
  return fetchJson<ProjectComment>(
    `/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/reopen`,
    { method: "POST" }
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

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};

  if (_getToken) {
    const token = await _getToken();

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  return fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) }
  });
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  options: { auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.auth !== false && _getToken) {
    const token = await _getToken();

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const mergedInit: RequestInit = {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) }
  };

  const response = await fetch(`${getSharedProjectApiBaseUrl()}${path}`, mergedInit);

  if (!response.ok) {
    throw await toApiError(response, "Shared project request failed.");
  }

  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isUpgradeRequiredError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 402;
}

async function toApiError(response: Response, fallback: string): Promise<ApiError> {
  let message = fallback;
  let code: string | undefined;

  try {
    const payload = (await response.json()) as { message?: unknown; code?: unknown };

    if (typeof payload.message === "string") {
      message = payload.message;
    }
    if (typeof payload.code === "string") {
      code = payload.code;
    }
  } catch {
  }

  return new ApiError(message, response.status, code);
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
