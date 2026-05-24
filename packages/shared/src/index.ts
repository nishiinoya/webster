/** Types shared by Webster frontend and future collaboration backend. */

export type WebsterProjectManifest = {
  app: "webster";
  canvas: {
    background: [number, number, number, number];
    height: number;
    width: number;
    x?: number;
    y?: number;
  };
  fonts?: WebsterProjectFontAsset[];
  layers: WebsterSerializedLayer[];
  selectedLayerId?: string | null;
  selectedLayerIds?: string[];
  template?: {
    isTemplate: true;
    name: string;
    savedAt: string;
    version: 1;
  };
  version: 1;
};

export type WebsterProjectFontAsset = {
  assetPath: string;
  family: string;
  id: string;
  italic: boolean;
  mimeType: string;
  name: string;
  style: string;
  weight: number;
};

export type WebsterSerializedLayer = Record<string, unknown> & {
  id: string;
  type: string;
};

export type ProjectRole = "owner" | "editor" | "viewer" | "commenter";

export type ProjectRoleCapabilities = {
  canComment: boolean;
  canCreateSnapshots: boolean;
  canDownloadWebster: boolean;
  canEdit: boolean;
  canManageMembers: boolean;
  canRestoreSnapshots: boolean;
};

export const projectRoleCapabilities: Record<ProjectRole, ProjectRoleCapabilities> = {
  owner: {
    canComment: true,
    canCreateSnapshots: true,
    canDownloadWebster: true,
    canEdit: true,
    canManageMembers: true,
    canRestoreSnapshots: true
  },
  editor: {
    canComment: true,
    canCreateSnapshots: true,
    canDownloadWebster: true,
    canEdit: true,
    canManageMembers: false,
    canRestoreSnapshots: false
  },
  commenter: {
    canComment: true,
    canCreateSnapshots: false,
    canDownloadWebster: false,
    canEdit: false,
    canManageMembers: false,
    canRestoreSnapshots: false
  },
  viewer: {
    canComment: false,
    canCreateSnapshots: false,
    canDownloadWebster: false,
    canEdit: false,
    canManageMembers: false,
    canRestoreSnapshots: false
  }
};

export type ProjectPermissionOverrides = Partial<ProjectRoleCapabilities>;

export function getProjectRoleCapabilities(
  role: ProjectRole,
  overrides: ProjectPermissionOverrides = {}
): ProjectRoleCapabilities {
  return {
    ...projectRoleCapabilities[role],
    ...overrides
  };
}

export type SharedProjectAssetReference = {
  assetId?: string;
  assetPath: string;
  downloadUrl: string;
  mimeType?: string;
};

export type SharedProjectSnapshotType = "automatic" | "manual" | "restore";

export type SharedProjectSnapshotSummary = {
  authorName?: string | null;
  createdAt: string;
  id: string;
  isCurrent?: boolean;
  message?: string | null;
  type?: SharedProjectSnapshotType;
  version: number;
};

export type SharedProjectUser = {
  color?: string;
  displayName: string;
  id: string;
  role?: ProjectRole;
  tool?: string | null;
};

export type SharedProjectPresence = {
  cursor?: {
    x: number;
    y: number;
  } | null;
  tool?: string | null;
  user: SharedProjectUser;
};

export type SharedProjectStatePayload = {
  assets?: SharedProjectAssetReference[];
  currentVersion: number;
  permissions?: ProjectPermissionOverrides;
  projectId: string;
  projectName?: string;
  role: ProjectRole;
  snapshot: WebsterProjectManifest;
  snapshots?: SharedProjectSnapshotSummary[];
  users?: SharedProjectPresence[];
};

export type ProjectCommentStatus = "open" | "resolved";

export type ProjectCommentAuthor = {
  displayName: string | null;
  email: string;
  id: string;
};

export type ProjectComment = {
  author: ProjectCommentAuthor;
  authorUserId: string;
  createdAt: string;
  deletedAt: string | null;
  id: string;
  layerId: string | null;
  localX?: number | null;
  localY?: number | null;
  parentCommentId: string | null;
  projectId: string;
  replies?: ProjectComment[];
  resolvedAt: string | null;
  resolvedByUser?: ProjectCommentAuthor | null;
  resolvedByUserId: string | null;
  status: ProjectCommentStatus;
  text: string;
  updatedAt: string;
  x: number | null;
  y: number | null;
};

export type ProjectCommentEventPayload = {
  comment?: ProjectComment;
  commentId?: string;
  projectId: string;
};

export type ProjectOperationPhase = "preview" | "commit";

export type ProjectOperationKind =
  | "asset:create"
  | "document:update"
  | "filter:update"
  | "image-layer:update"
  | "layer:create"
  | "layer:delete"
  | "layer:reorder"
  | "layer:transform"
  | "layer:update"
  | "mask:paint"
  | "object3d:update"
  | "scene:replace"
  | "selection:update"
  | "shape:edit"
  | "stroke:commit"
  | "text:edit";

/**
 * RFC 6902 JSON Patch op. Kept loose on purpose so we don't pull in
 * `fast-json-patch`'s types from the shared package.
 */
export type ProjectScenePatchOp = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  from?: string;
  value?: unknown;
};

export type ProjectOperation = {
  assetReferences?: SharedProjectAssetReference[];
  baseVersion: number;
  clientId: string;
  clientOperationId: string;
  createdAt: string;
  kind: ProjectOperationKind;
  label?: string;
  payload: Record<string, unknown>;
  phase: ProjectOperationPhase;
  projectId: string;
  /**
   * Full scene snapshot. Sent for the FIRST commit in a session, after a
   * resync, or on import. For incremental updates use `scenePatch`.
   */
  scene?: WebsterProjectManifest;
  /**
   * RFC 6902 patch describing the change from the previous scene to this
   * commit's scene. Massively smaller than `scene` for keystroke-level edits.
   * Server applies it to the stored manifest; receivers apply it to their
   * local copy.
   */
  scenePatch?: ProjectScenePatchOp[];
};

export type AppliedProjectOperation = {
  operation: ProjectOperation;
  projectId: string;
  serverOperationId?: string;
  version: number;
};

export type ProjectErrorCode =
  | "forbidden"
  | "not_found"
  | "socket_error"
  | "version_conflict";

export type ProjectErrorPayload = {
  code: ProjectErrorCode;
  message: string;
  projectId?: string;
};

export type ClientToServerCollaborationEvent =
  | { payload: { clientId: string; projectId: string }; type: "project:join" }
  | { payload: { clientId: string; projectId: string }; type: "project:leave" }
  | { payload: ProjectOperation; type: "operation:preview" }
  | { payload: ProjectOperation; type: "operation:commit" }
  | {
      payload: {
        clientId: string;
        cursor: { x: number; y: number } | null;
        projectId: string;
        tool?: string | null;
      };
      type: "presence:cursor";
    };

export type ServerToClientCollaborationEvent =
  | { payload: ProjectCommentEventPayload; type: "comment:create" }
  | { payload: ProjectCommentEventPayload; type: "comment:update" }
  | { payload: ProjectCommentEventPayload; type: "comment:delete" }
  | { payload: ProjectCommentEventPayload; type: "comment:resolve" }
  | { payload: ProjectCommentEventPayload; type: "comment:reopen" }
  | { payload: SharedProjectStatePayload; type: "project:state" }
  | { payload: AppliedProjectOperation; type: "operation:applied" }
  | { payload: ProjectOperation; type: "operation:preview" }
  | { payload: SharedProjectPresence[]; type: "presence:update" }
  | { payload: ProjectErrorPayload; type: "project:error" };

export type SharedProjectLoadResponse = SharedProjectStatePayload;
