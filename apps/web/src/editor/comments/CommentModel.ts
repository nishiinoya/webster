import type { ProjectComment } from "@webster/shared";

import { transformPoint3x3 } from "../geometry/Matrix3";
import { getModelMatrix } from "../geometry/TransformGeometry";
import type { Layer } from "../layers/Layer";

export type PendingCommentDraft = {
  layerId: string | null;
  localX: number | null;
  localY: number | null;
  text: string;
  x: number;
  y: number;
};

export type CommentDraftMode =
  | { type: "none" }
  | { type: "pending" }
  | { commentId: string; type: "reply" }
  | { commentId: string; type: "edit" };

export type CommentEditDraft = {
  commentId: string;
  text: string;
};

export type CommentDraftState = {
  canComment: boolean;
  canModerate: boolean;
  commentError: string | null;
  currentUserId: string | null;
  editDraft: CommentEditDraft | null;
  isLoading: boolean;
  mode: CommentDraftMode;
  pendingComment: PendingCommentDraft | null;
  replyDrafts: Record<string, string>;
};

export type EditorCommentOverlayState = {
  activeCommentId: string | null;
  comments: ProjectComment[];
  draft: CommentDraftState;
  hoveredCommentId: string | null;
};

export function createEmptyCommentDraftState(): CommentDraftState {
  return {
    canComment: false,
    canModerate: false,
    commentError: null,
    currentUserId: null,
    editDraft: null,
    isLoading: false,
    mode: { type: "none" },
    pendingComment: null,
    replyDrafts: {}
  };
}

export function createEmptyCommentOverlayState(): EditorCommentOverlayState {
  return {
    activeCommentId: null,
    comments: [],
    draft: createEmptyCommentDraftState(),
    hoveredCommentId: null
  };
}

export function getRootComments(comments: ProjectComment[]) {
  return comments.filter((comment) => comment.parentCommentId === null);
}

export function findCommentById(comments: ProjectComment[], commentId: string): ProjectComment | null {
  for (const comment of comments) {
    if (comment.id === commentId) {
      return comment;
    }

    const reply = (comment.replies ?? []).find((candidate) => candidate.id === commentId);

    if (reply) {
      return reply;
    }
  }

  return null;
}

export function getCommentDisplayName(comment: ProjectComment) {
  return comment.author.displayName || comment.author.email;
}

export function getCommentThreadCount(comment: ProjectComment) {
  return 1 + (comment.replies?.length ?? 0);
}

export function getCommentReplySummary(comment: ProjectComment) {
  const replyCount = comment.replies?.length ?? 0;

  if (replyCount === 0) {
    return "No replies";
  }

  return replyCount === 1 ? "1 reply" : `${replyCount} replies`;
}

export function canEditComment(comment: ProjectComment, currentUserId: string | null) {
  return comment.status === "open" && currentUserId === comment.authorUserId;
}

export function canDeleteComment(
  comment: ProjectComment,
  currentUserId: string | null,
  canModerate: boolean
) {
  return canModerate || (comment.status === "open" && currentUserId === comment.authorUserId);
}

export function canToggleCommentResolved(
  comment: ProjectComment,
  currentUserId: string | null,
  canModerate: boolean
) {
  return canModerate || currentUserId === comment.authorUserId;
}

export function resolveCommentWorldPoint(
  comment: Pick<ProjectComment, "layerId" | "localX" | "localY" | "x" | "y">,
  getLayer?: (layerId: string) => Layer | null
) {
  if (
    comment.layerId &&
    comment.localX !== null &&
    comment.localX !== undefined &&
    comment.localY !== null &&
    comment.localY !== undefined &&
    getLayer
  ) {
    const layer = getLayer(comment.layerId);

    if (layer) {
      return transformPoint3x3(getModelMatrix(layer), comment.localX, comment.localY);
    }
  }

  if (comment.x === null || comment.x === undefined || comment.y === null || comment.y === undefined) {
    return null;
  }

  return { x: comment.x, y: comment.y };
}
