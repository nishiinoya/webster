import type { ProjectComment } from "@webster/shared";

import { Camera2D } from "../../geometry/Camera2D";
import { Scene } from "../../scene/Scene";
import {
  canDeleteComment,
  canEditComment,
  canToggleCommentResolved,
  findCommentById,
  getCommentDisplayName,
  getCommentReplySummary,
  getCommentThreadCount,
  getRootComments,
  resolveCommentWorldPoint
} from "../../comments/CommentModel";
import type {
  EditorCommentOverlayState,
  PendingCommentDraft
} from "../../comments/CommentModel";

export type ScreenPoint = {
  x: number;
  y: number;
};

export type ScreenRect = ScreenPoint & {
  height: number;
  width: number;
};

export type CommentOverlayViewport = {
  height: number;
  width: number;
};

export type CommentCardAction =
  | { type: "cancel-pending" }
  | { type: "close" }
  | { type: "submit-pending" }
  | { commentId: string; type: "cancel-edit" }
  | { commentId: string; type: "cancel-reply" }
  | { commentId: string; type: "delete" }
  | { commentId: string; type: "reopen" }
  | { commentId: string; type: "resolve" }
  | { commentId: string; type: "start-edit" }
  | { commentId: string; type: "start-reply" }
  | { commentId: string; type: "submit-edit" }
  | { commentId: string; type: "submit-reply" };

export type OverlayTextItem = {
  align?: "center" | "left" | "right";
  bold?: boolean;
  color: [number, number, number, number];
  fontSize: number;
  rect: ScreenRect;
  text: string;
};

export type CommentActionButtonLayout = {
  action: CommentCardAction;
  disabled?: boolean;
  label: string;
  primary?: boolean;
  rect: ScreenRect;
};

export type CommentPinLayout = {
  anchor: ScreenPoint;
  bodyRect: ScreenRect;
  comment: ProjectComment;
  commentId: string;
  count: number;
  hitRect: ScreenRect;
  isActive: boolean;
  isHovered: boolean;
  status: ProjectComment["status"];
  text: OverlayTextItem | null;
  tipRect: ScreenRect;
};

export type PendingCommentPinLayout = {
  anchor: ScreenPoint;
  bodyRect: ScreenRect;
  hitRect: ScreenRect;
  tipRect: ScreenRect;
};

export type CommentCardLayout = {
  actionButtons: CommentActionButtonLayout[];
  bodyRect?: ScreenRect;
  connectorLine: { end: ScreenPoint; start: ScreenPoint } | null;
  draftRect?: ScreenRect;
  mode: "comment" | "pending";
  repliesRect?: ScreenRect;
  rect: ScreenRect;
  status: "open" | "pending" | "resolved";
  textItems: OverlayTextItem[];
};

export type CommentOverlayLayout = {
  card: CommentCardLayout | null;
  pendingPin: PendingCommentPinLayout | null;
  pins: CommentPinLayout[];
};

export type CommentOverlayHit =
  | { action: CommentCardAction; type: "action" }
  | { commentId: string; type: "pin" }
  | { type: "card" };

const pinSize = 28;
const pinTipSize = 10;
const pinHeight = 35;
const cardWidth = 360;
const cardPadding = 14;
const buttonHeight = 28;
const bodyLineHeight = 22;
const replyLineHeight = 20;

export function buildCommentOverlayLayout(
  state: EditorCommentOverlayState,
  scene: Scene,
  camera: Camera2D,
  viewport: CommentOverlayViewport
): CommentOverlayLayout {
  const pins = getRootComments(state.comments)
    .map((comment): CommentPinLayout | null => {
      const anchor = getCommentScreenPoint(comment, scene, camera);

      if (!anchor) {
        return null;
      }

      const bodyRect = {
        x: anchor.x - pinSize / 2,
        y: anchor.y - pinHeight,
        width: pinSize,
        height: pinSize
      };
      const count = getCommentThreadCount(comment);

      return {
        anchor,
        bodyRect,
        comment,
        commentId: comment.id,
        count,
        hitRect: {
          x: anchor.x - 18,
          y: anchor.y - pinHeight - 4,
          width: 36,
          height: 40
        },
        isActive: state.activeCommentId === comment.id,
        isHovered: state.hoveredCommentId === comment.id,
        status: comment.status,
        text:
          count > 1
            ? {
                align: "center",
                bold: true,
                color: comment.status === "resolved" ? [0.88, 0.9, 0.92, 1] : [0.06, 0.07, 0.08, 1],
                fontSize: 15,
                rect: {
                  x: bodyRect.x + 3,
                  y: bodyRect.y + 5,
                  width: bodyRect.width - 6,
                  height: 17
                },
                text: String(Math.min(count, 99))
              }
            : null,
        tipRect: {
          x: anchor.x - pinTipSize / 2,
          y: anchor.y - pinTipSize - 3,
          width: pinTipSize,
          height: pinTipSize
        }
      };
    })
    .filter((pin): pin is CommentPinLayout => Boolean(pin));

  const pendingPin = state.draft.pendingComment
    ? getPendingPinLayout(state.draft.pendingComment, scene, camera)
    : null;
  const card = buildActiveCard(state, scene, camera, viewport);

  return {
    card,
    pendingPin,
    pins
  };
}

export function hitTestCommentOverlay(
  state: EditorCommentOverlayState,
  scene: Scene,
  camera: Camera2D,
  viewport: CommentOverlayViewport,
  point: ScreenPoint
): CommentOverlayHit | null {
  const layout = buildCommentOverlayLayout(state, scene, camera, viewport);

  if (layout.card) {
    for (let index = layout.card.actionButtons.length - 1; index >= 0; index -= 1) {
      const button = layout.card.actionButtons[index];

      if (!button.disabled && containsPoint(button.rect, point)) {
        return { action: button.action, type: "action" };
      }
    }

    if (containsPoint(layout.card.rect, point)) {
      return { type: "card" };
    }
  }

  if (layout.pendingPin && containsPoint(layout.pendingPin.hitRect, point)) {
    return { type: "card" };
  }

  for (let index = layout.pins.length - 1; index >= 0; index -= 1) {
    const pin = layout.pins[index];

    if (containsPoint(pin.hitRect, point)) {
      return { commentId: pin.commentId, type: "pin" };
    }
  }

  return null;
}

export function getCommentAtScreenPoint(
  state: EditorCommentOverlayState,
  scene: Scene,
  camera: Camera2D,
  viewport: CommentOverlayViewport,
  point: ScreenPoint
) {
  const hit = hitTestCommentOverlay(state, scene, camera, viewport, point);

  return hit?.type === "pin" ? hit.commentId : null;
}

function buildActiveCard(
  state: EditorCommentOverlayState,
  scene: Scene,
  camera: Camera2D,
  viewport: CommentOverlayViewport
): CommentCardLayout | null {
  if (state.draft.pendingComment) {
    return buildPendingCard(state, scene, camera, viewport);
  }

  if (!state.activeCommentId) {
    return null;
  }

  const comment = findCommentById(state.comments, state.activeCommentId);

  if (!comment) {
    return null;
  }

  const anchor = getCommentScreenPoint(comment, scene, camera);

  if (!anchor) {
    return null;
  }

  const isReplying =
    state.draft.mode.type === "reply" && state.draft.mode.commentId === comment.id;
  const isEditing =
    state.draft.mode.type === "edit" && state.draft.mode.commentId === comment.id;
  const draftText = isEditing
    ? state.draft.editDraft?.text ?? comment.text
    : isReplying
      ? state.draft.replyDrafts[comment.id] ?? ""
      : "";
  const bodyLines = wrapOverlayText(comment.text, 44, isEditing ? 2 : 4);
  const replyLines = getReplyOverlayLines(comment);
  const draftLines = isReplying || isEditing
    ? wrapOverlayText(draftText || (isEditing ? "Edit comment" : "Reply"), 42, 2)
    : [];
  const buttons = getCommentCardActions(comment, state, {
    draftText,
    isEditing,
    isReplying
  });
  const draftHeight = isReplying || isEditing ? 58 : 0;
  const bodyHeight = bodyLines.length * bodyLineHeight;
  const repliesHeight = replyLines.length > 0 ? replyLines.length * replyLineHeight + 12 : 0;
  const actionsHeight = buttons.length > 0 ? 38 : 0;
  const errorHeight = state.draft.commentError ? 18 : 0;
  const cardHeight =
    cardPadding * 2 +
    22 +
    24 +
    bodyHeight +
    (repliesHeight ? repliesHeight + 8 : 0) +
    (draftHeight ? draftHeight + 8 : 0) +
    actionsHeight +
    errorHeight;
  const rect = placeCard(anchor, cardHeight, viewport);
  const textItems: OverlayTextItem[] = [];
  const bodyRect = {
    x: rect.x + cardPadding,
    y: rect.y + 54,
    width: rect.width - cardPadding * 2,
    height: bodyHeight
  };

  textItems.push({
    bold: true,
    color: [0.93, 0.95, 0.96, 1],
    fontSize: 15,
    rect: {
      x: rect.x + cardPadding,
      y: rect.y + 12,
      width: rect.width - cardPadding * 2 - 70,
      height: 18
    },
    text: truncateOverlayText(getCommentDisplayName(comment), 30)
  });
  textItems.push({
    align: "right",
    bold: true,
    color: comment.status === "resolved" ? [0.65, 0.69, 0.73, 1] : [0.94, 0.72, 0.35, 1],
    fontSize: 12,
    rect: {
      x: rect.x + rect.width - cardPadding - 74,
      y: rect.y + 14,
      width: 74,
      height: 14
    },
    text: comment.status
  });
  textItems.push({
    color: [0.58, 0.62, 0.68, 1],
    fontSize: 12,
    rect: {
      x: rect.x + cardPadding,
      y: rect.y + 33,
      width: rect.width - cardPadding * 2,
      height: 15
    },
    text: `${getCommentReplySummary(comment)} / ${comment.layerId ? "Layer" : "Project"}`
  });

  bodyLines.forEach((line, index) => {
    textItems.push({
      color: [0.86, 0.88, 0.9, 1],
      fontSize: 15,
      rect: {
        x: bodyRect.x,
        y: bodyRect.y + index * bodyLineHeight,
        width: bodyRect.width,
        height: bodyLineHeight
      },
      text: line
    });
  });

  let nextY = bodyRect.y + bodyHeight + 8;
  const repliesRect = repliesHeight
    ? {
        x: rect.x + cardPadding,
        y: nextY,
        width: rect.width - cardPadding * 2,
        height: repliesHeight
      }
    : undefined;

  if (repliesRect) {
    replyLines.forEach((line, index) => {
      textItems.push({
        bold: line.kind === "author",
        color: line.kind === "author" ? [0.62, 0.83, 0.78, 1] : [0.78, 0.81, 0.84, 1],
        fontSize: line.kind === "author" ? 12 : 13,
        rect: {
          x: repliesRect.x + 9,
          y: repliesRect.y + 7 + index * replyLineHeight,
          width: repliesRect.width - 18,
          height: 17
        },
        text: line.text
      });
    });
    nextY += repliesHeight + 8;
  }

  const draftRect = draftHeight
    ? {
        x: rect.x + cardPadding,
        y: nextY,
        width: rect.width - cardPadding * 2,
        height: draftHeight
      }
    : undefined;

  if (draftRect) {
    draftLines.forEach((line, index) => {
      textItems.push({
        color: draftText ? [0.92, 0.94, 0.95, 1] : [0.52, 0.56, 0.61, 1],
        fontSize: 15,
        rect: {
          x: draftRect.x + 8,
          y: draftRect.y + 9 + index * bodyLineHeight,
          width: draftRect.width - 16,
          height: bodyLineHeight
        },
        text: line
      });
    });
    nextY += draftHeight + 8;
  }

  if (state.draft.commentError) {
    textItems.push({
      color: [1, 0.76, 0.76, 1],
      fontSize: 12,
      rect: {
        x: rect.x + cardPadding,
        y: nextY,
        width: rect.width - cardPadding * 2,
        height: 15
      },
      text: truncateOverlayText(state.draft.commentError, 42)
    });
    nextY += errorHeight;
  }

  const actionButtons = layoutButtons(buttons, rect, nextY);

  for (const button of actionButtons) {
    textItems.push({
      align: "center",
      bold: true,
      color: button.disabled
        ? [0.47, 0.5, 0.55, 1]
        : button.primary
          ? [0.05, 0.07, 0.07, 1]
          : [0.82, 0.85, 0.88, 1],
      fontSize: 12,
      rect: {
        x: button.rect.x + 4,
        y: button.rect.y + 8,
        width: button.rect.width - 8,
        height: 14
      },
      text: button.label
    });
  }

  return {
    actionButtons,
    bodyRect,
    connectorLine: getCardConnectorLine(anchor, rect),
    draftRect,
    mode: "comment",
    repliesRect,
    rect,
    status: comment.status,
    textItems
  };
}

function buildPendingCard(
  state: EditorCommentOverlayState,
  scene: Scene,
  camera: Camera2D,
  viewport: CommentOverlayViewport
): CommentCardLayout | null {
  const pending = state.draft.pendingComment;

  if (!pending) {
    return null;
  }

  const anchor = getPendingScreenPoint(pending, scene, camera);

  if (!anchor) {
    return null;
  }

  const draftLines = wrapOverlayText(pending.text || "Add a comment", 42, 3);
  const draftHeight = 76;
  const errorHeight = state.draft.commentError ? 18 : 0;
  const cardHeight = cardPadding * 2 + 38 + draftHeight + 8 + 38 + errorHeight;
  const rect = placeCard(anchor, cardHeight, viewport);
  const textItems: OverlayTextItem[] = [];
  const draftRect = {
    x: rect.x + cardPadding,
    y: rect.y + 44,
    width: rect.width - cardPadding * 2,
    height: draftHeight
  };

  textItems.push({
    bold: true,
    color: [0.93, 0.95, 0.96, 1],
    fontSize: 15,
    rect: {
      x: rect.x + cardPadding,
      y: rect.y + 12,
      width: rect.width - cardPadding * 2,
      height: 18
    },
    text: "New comment"
  });
  textItems.push({
    color: [0.6, 0.64, 0.69, 1],
    fontSize: 12,
    rect: {
      x: rect.x + cardPadding,
      y: rect.y + 32,
      width: rect.width - cardPadding * 2,
      height: 15
    },
    text: pending.layerId ? "Anchored to layer" : "Anchored to canvas"
  });

  draftLines.forEach((line, index) => {
    textItems.push({
      color: pending.text ? [0.92, 0.94, 0.95, 1] : [0.52, 0.56, 0.61, 1],
      fontSize: 15,
      rect: {
        x: draftRect.x + 8,
        y: draftRect.y + 10 + index * bodyLineHeight,
        width: draftRect.width - 16,
        height: bodyLineHeight
      },
      text: line
    });
  });

  let nextY = draftRect.y + draftRect.height + 8;

  if (state.draft.commentError) {
    textItems.push({
      color: [1, 0.76, 0.76, 1],
      fontSize: 12,
      rect: {
        x: rect.x + cardPadding,
        y: nextY,
        width: rect.width - cardPadding * 2,
        height: 15
      },
      text: truncateOverlayText(state.draft.commentError, 42)
    });
    nextY += errorHeight;
  }

  const actionButtons = layoutButtons(
    [
      { action: { type: "cancel-pending" }, label: "Cancel" },
      {
        action: { type: "submit-pending" },
        disabled: pending.text.trim().length === 0,
        label: "Comment",
        primary: true
      }
    ],
    rect,
    nextY
  );

  for (const button of actionButtons) {
    textItems.push({
      align: "center",
      bold: true,
      color: button.disabled
        ? [0.47, 0.5, 0.55, 1]
        : button.primary
          ? [0.05, 0.07, 0.07, 1]
          : [0.82, 0.85, 0.88, 1],
      fontSize: 12,
      rect: {
        x: button.rect.x + 4,
        y: button.rect.y + 8,
        width: button.rect.width - 8,
        height: 14
      },
      text: button.label
    });
  }

  return {
    actionButtons,
    connectorLine: getCardConnectorLine(anchor, rect),
    draftRect,
    mode: "pending",
    rect,
    status: "pending",
    textItems
  };
}

function getCommentCardActions(
  comment: ProjectComment,
  state: EditorCommentOverlayState,
  draft: {
    draftText: string;
    isEditing: boolean;
    isReplying: boolean;
  }
): Array<Omit<CommentActionButtonLayout, "rect">> {
  if (draft.isEditing) {
    return [
      { action: { commentId: comment.id, type: "cancel-edit" }, label: "Cancel" },
      {
        action: { commentId: comment.id, type: "submit-edit" },
        disabled: draft.draftText.trim().length === 0,
        label: "Save",
        primary: true
      }
    ];
  }

  if (draft.isReplying) {
    return [
      { action: { commentId: comment.id, type: "cancel-reply" }, label: "Cancel" },
      {
        action: { commentId: comment.id, type: "submit-reply" },
        disabled: draft.draftText.trim().length === 0,
        label: "Reply",
        primary: true
      }
    ];
  }

  const buttons: Array<Omit<CommentActionButtonLayout, "rect">> = [];

  buttons.push({ action: { type: "close" }, label: "X" });

  if (state.draft.canComment && comment.status === "open") {
    buttons.push({
      action: { commentId: comment.id, type: "start-reply" },
      label: "Reply",
      primary: true
    });
  }

  if (canEditComment(comment, state.draft.currentUserId)) {
    buttons.push({ action: { commentId: comment.id, type: "start-edit" }, label: "Edit" });
  }

  if (canDeleteComment(comment, state.draft.currentUserId, state.draft.canModerate)) {
    buttons.push({ action: { commentId: comment.id, type: "delete" }, label: "Delete" });
  }

  if (canToggleCommentResolved(comment, state.draft.currentUserId, state.draft.canModerate)) {
    buttons.push({
      action: {
        commentId: comment.id,
        type: comment.status === "resolved" ? "reopen" : "resolve"
      },
      label: comment.status === "resolved" ? "Reopen" : "Resolve"
    });
  }

  return buttons;
}

function layoutButtons(
  buttons: Array<Omit<CommentActionButtonLayout, "rect">>,
  cardRect: ScreenRect,
  y: number
): CommentActionButtonLayout[] {
  let right = cardRect.x + cardRect.width - cardPadding;

  return [...buttons].reverse().map((button) => {
    const width = getButtonWidth(button.label);
    right -= width;
    const rect = {
      x: right,
      y,
      width,
      height: buttonHeight
    };
    right -= 6;

    return {
      ...button,
      rect
    };
  }).reverse();
}

function getPendingPinLayout(
  pending: PendingCommentDraft,
  scene: Scene,
  camera: Camera2D
): PendingCommentPinLayout | null {
  const anchor = getPendingScreenPoint(pending, scene, camera);

  if (!anchor) {
    return null;
  }

  return {
    anchor,
    bodyRect: {
      x: anchor.x - pinSize / 2,
      y: anchor.y - pinHeight,
      width: pinSize,
      height: pinSize
    },
    hitRect: {
      x: anchor.x - 18,
      y: anchor.y - pinHeight - 4,
      width: 36,
      height: 40
    },
    tipRect: {
      x: anchor.x - pinTipSize / 2,
      y: anchor.y - pinTipSize - 3,
      width: pinTipSize,
      height: pinTipSize
    }
  };
}

function getCommentScreenPoint(comment: ProjectComment, scene: Scene, camera: Camera2D) {
  const point = resolveCommentWorldPoint(comment, (layerId) => scene.getLayer(layerId));

  return point ? camera.worldToScreen(point.x, point.y) : null;
}

function getPendingScreenPoint(pending: PendingCommentDraft, scene: Scene, camera: Camera2D) {
  const point = resolveCommentWorldPoint(pending, (layerId) => scene.getLayer(layerId));

  return point ? camera.worldToScreen(point.x, point.y) : null;
}

function placeCard(anchor: ScreenPoint, height: number, viewport: CommentOverlayViewport): ScreenRect {
  const width = Math.min(cardWidth, Math.max(260, viewport.width - 24));
  const preferRight = anchor.x + 18 + width <= viewport.width - 12;

  return {
    x: preferRight ? anchor.x + 18 : anchor.x - width - 18,
    y: anchor.y - 38,
    width,
    height
  };
}

type ReplyOverlayLine = {
  kind: "author" | "text";
  text: string;
};

function getReplyOverlayLines(comment: ProjectComment): ReplyOverlayLine[] {
  const replies = comment.replies ?? [];

  if (replies.length === 0) {
    return [];
  }

  const visibleReplies = replies.slice(Math.max(0, replies.length - 3));
  const lines: ReplyOverlayLine[] = [];

  for (const reply of visibleReplies) {
    lines.push({
      kind: "author",
      text: truncateOverlayText(getCommentDisplayName(reply), 34)
    });

    for (const text of wrapOverlayText(reply.text, 44, 2)) {
      lines.push({
        kind: "text",
        text
      });
    }
  }

  if (replies.length > visibleReplies.length) {
    lines.push({
      kind: "text",
      text: `+${replies.length - visibleReplies.length} earlier replies`
    });
  }

  return lines;
}

function getCardConnectorLine(anchor: ScreenPoint, rect: ScreenRect) {
  const clampedX = clamp(anchor.x, rect.x + 8, rect.x + rect.width - 8);
  const clampedY = clamp(anchor.y, rect.y + 8, rect.y + rect.height - 8);
  const distances = [
    { edge: "left", value: Math.abs(anchor.x - rect.x) },
    { edge: "right", value: Math.abs(anchor.x - (rect.x + rect.width)) },
    { edge: "top", value: Math.abs(anchor.y - rect.y) },
    { edge: "bottom", value: Math.abs(anchor.y - (rect.y + rect.height)) }
  ].sort((a, b) => a.value - b.value);
  const edge = distances[0].edge;
  const end =
    edge === "left"
      ? { x: rect.x, y: clampedY }
      : edge === "right"
        ? { x: rect.x + rect.width, y: clampedY }
        : edge === "top"
          ? { x: clampedX, y: rect.y }
          : { x: clampedX, y: rect.y + rect.height };

  return { end, start: anchor };
}

function wrapOverlayText(text: string, maxChars: number, maxLines: number) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return [""];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    current = word.length > maxChars ? `${word.slice(0, Math.max(1, maxChars - 1))}.` : word;

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = truncateOverlayText(lines[maxLines - 1], maxChars);
  }

  return lines;
}

function truncateOverlayText(text: string, maxChars: number) {
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}.` : text;
}

function getButtonWidth(label: string) {
  if (label === "X") {
    return 32;
  }

  return Math.max(64, Math.min(98, label.length * 8 + 26));
}

function containsPoint(rect: ScreenRect, point: ScreenPoint) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
