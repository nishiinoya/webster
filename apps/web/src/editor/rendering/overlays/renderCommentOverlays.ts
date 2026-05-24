import { Camera2D } from "../../geometry/Camera2D";
import { defaultLayerFilters } from "../../layers/Layer";
import { Scene } from "../../scene/Scene";
import type { EditorCommentOverlayState } from "../../comments/CommentModel";
import { SolidColorShaderProgram } from "../shaders/SolidColorShaderProgram";
import {
  buildCommentOverlayLayout,
  type CommentActionButtonLayout,
  type CommentCardLayout,
  type CommentOverlayViewport,
  type CommentPinLayout,
  type OverlayTextItem,
  type PendingCommentPinLayout,
  type ScreenRect
} from "./commentHitTesting";

type CommentOverlayRendererContext = {
  drawScreenLine: (
    start: { x: number; y: number },
    end: { x: number; y: number },
    width: number
  ) => void;
  drawScreenRectangle: (rectangle: {
    height: number;
    rotation?: number;
    width: number;
    x: number;
    y: number;
  }) => void;
  drawScreenText: (text: OverlayTextItem) => void;
  solidColorShaderProgram: SolidColorShaderProgram;
};

export function renderCommentOverlays(
  context: CommentOverlayRendererContext,
  scene: Scene,
  camera: Camera2D,
  state: EditorCommentOverlayState | null,
  viewport: CommentOverlayViewport
) {
  if (!state) {
    return;
  }

  const layout = buildCommentOverlayLayout(state, scene, camera, viewport);

  context.solidColorShaderProgram.use();
  context.solidColorShaderProgram.setProjection(
    getScreenProjectionMatrix(viewport.width, viewport.height)
  );
  context.solidColorShaderProgram.setFilters(defaultLayerFilters);
  context.solidColorShaderProgram.setAdjustmentFilters([]);
  context.solidColorShaderProgram.setMaskEnabled(false);
  context.solidColorShaderProgram.setLayerTexture(null);
  context.solidColorShaderProgram.setImportedTexture(false);

  for (const pin of layout.pins) {
    drawCommentPin(context, camera, pin);
  }

  if (layout.pendingPin) {
    drawPendingPin(context, camera, layout.pendingPin);
  }

  if (layout.card) {
    drawCommentCard(context, camera, layout.card);
  }
}

function drawCommentPin(
  context: CommentOverlayRendererContext,
  camera: Camera2D,
  pin: CommentPinLayout
) {
  const isResolved = pin.status === "resolved";
  const fill: [number, number, number, number] = isResolved
    ? [0.34, 0.37, 0.41, 0.88]
    : [0.95, 0.7, 0.27, 1];
  const border: [number, number, number, number] = pin.isActive
    ? [0.49, 0.88, 0.78, 1]
    : pin.isHovered
      ? [1, 0.92, 0.66, 1]
      : [0.06, 0.07, 0.08, 1];

  drawScreenRect(context, camera, expandRect(pin.bodyRect, pin.isActive || pin.isHovered ? 4 : 3), border);
  drawScreenDiamond(context, camera, expandRect(pin.tipRect, pin.isActive || pin.isHovered ? 3 : 2), border);
  drawScreenRect(context, camera, pin.bodyRect, fill);
  drawScreenDiamond(context, camera, pin.tipRect, fill);

  if (isResolved) {
    drawScreenLine(context, camera, { x: pin.bodyRect.x + 7, y: pin.bodyRect.y + 14 }, { x: pin.bodyRect.x + 12, y: pin.bodyRect.y + 19 }, 2.2, [0.9, 0.93, 0.95, 1]);
    drawScreenLine(context, camera, { x: pin.bodyRect.x + 12, y: pin.bodyRect.y + 19 }, { x: pin.bodyRect.x + 20, y: pin.bodyRect.y + 8 }, 2.2, [0.9, 0.93, 0.95, 1]);
  } else if (!pin.text) {
    drawScreenRect(
      context,
      camera,
      {
        x: pin.bodyRect.x + 11,
        y: pin.bodyRect.y + 8,
        width: 4,
        height: 10
      },
      [0.06, 0.07, 0.08, 1]
    );
    drawScreenRect(
      context,
      camera,
      {
        x: pin.bodyRect.x + 11,
        y: pin.bodyRect.y + 20,
        width: 4,
        height: 4
      },
      [0.06, 0.07, 0.08, 1]
    );
  }

  if (pin.text) {
    context.drawScreenText(pin.text);
  }
}

function drawPendingPin(
  context: CommentOverlayRendererContext,
  camera: Camera2D,
  pin: PendingCommentPinLayout
) {
  drawScreenRect(context, camera, expandRect(pin.bodyRect, 4), [0.49, 0.88, 0.78, 1]);
  drawScreenDiamond(context, camera, expandRect(pin.tipRect, 3), [0.49, 0.88, 0.78, 1]);
  drawScreenRect(context, camera, pin.bodyRect, [0.08, 0.34, 0.31, 1]);
  drawScreenDiamond(context, camera, pin.tipRect, [0.08, 0.34, 0.31, 1]);
  drawScreenLine(context, camera, { x: pin.bodyRect.x + 8, y: pin.bodyRect.y + 13 }, { x: pin.bodyRect.x + 18, y: pin.bodyRect.y + 13 }, 2, [0.88, 1, 0.96, 1]);
  drawScreenLine(context, camera, { x: pin.bodyRect.x + 13, y: pin.bodyRect.y + 8 }, { x: pin.bodyRect.x + 13, y: pin.bodyRect.y + 18 }, 2, [0.88, 1, 0.96, 1]);
}

function drawCommentCard(
  context: CommentOverlayRendererContext,
  camera: Camera2D,
  card: CommentCardLayout
) {
  if (card.connectorLine) {
    drawScreenLine(
      context,
      camera,
      card.connectorLine.start,
      card.connectorLine.end,
      1.4,
      card.status === "resolved" ? [0.44, 0.48, 0.52, 0.65] : [0.95, 0.7, 0.27, 0.72]
    );
  }

  drawScreenRect(context, camera, expandRect(card.rect, 1), [0.03, 0.035, 0.04, 0.92]);
  drawScreenRect(context, camera, card.rect, [0.09, 0.1, 0.12, 0.97]);
  drawScreenRect(
    context,
    camera,
    {
      x: card.rect.x,
      y: card.rect.y,
      width: card.rect.width,
      height: 4
    },
    card.status === "resolved"
      ? [0.44, 0.48, 0.52, 1]
      : card.status === "pending"
        ? [0.49, 0.88, 0.78, 1]
        : [0.95, 0.7, 0.27, 1]
  );

  if (card.bodyRect) {
    drawScreenRect(context, camera, card.bodyRect, [0.12, 0.13, 0.15, 0.35]);
  }

  if (card.repliesRect) {
    drawScreenRect(context, camera, expandRect(card.repliesRect, 1), [0.2, 0.23, 0.25, 0.85]);
    drawScreenRect(context, camera, card.repliesRect, [0.08, 0.09, 0.105, 0.9]);
  }

  if (card.draftRect) {
    drawScreenRect(context, camera, expandRect(card.draftRect, 1), [0.24, 0.27, 0.31, 1]);
    drawScreenRect(context, camera, card.draftRect, [0.055, 0.06, 0.07, 1]);
  }

  for (const button of card.actionButtons) {
    drawButton(context, camera, button);
  }

  for (const item of card.textItems) {
    context.drawScreenText(item);
  }
}

function drawButton(
  context: CommentOverlayRendererContext,
  camera: Camera2D,
  button: CommentActionButtonLayout
) {
  const border: [number, number, number, number] = button.disabled
    ? [0.2, 0.22, 0.25, 1]
    : button.primary
      ? [0.49, 0.88, 0.78, 1]
      : [0.25, 0.28, 0.32, 1];
  const fill: [number, number, number, number] = button.disabled
    ? [0.11, 0.12, 0.14, 1]
    : button.primary
      ? [0.49, 0.88, 0.78, 1]
      : [0.13, 0.15, 0.17, 1];

  drawScreenRect(context, camera, expandRect(button.rect, 1), border);
  drawScreenRect(context, camera, button.rect, fill);
}

function drawScreenRect(
  context: CommentOverlayRendererContext,
  camera: Camera2D,
  rect: ScreenRect,
  color: [number, number, number, number]
) {
  context.solidColorShaderProgram.setColor(color);
  context.drawScreenRectangle(rect);
}

function drawScreenDiamond(
  context: CommentOverlayRendererContext,
  camera: Camera2D,
  rect: ScreenRect,
  color: [number, number, number, number]
) {
  context.solidColorShaderProgram.setColor(color);
  context.drawScreenRectangle({
    ...rect,
    rotation: 45
  });
}

function drawScreenLine(
  context: CommentOverlayRendererContext,
  camera: Camera2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number,
  color: [number, number, number, number]
) {
  context.solidColorShaderProgram.setColor(color);
  context.drawScreenLine(start, end, width);
}

function expandRect(rect: ScreenRect, amount: number): ScreenRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2
  };
}

function getScreenProjectionMatrix(width: number, height: number) {
  return new Float32Array([
    2 / Math.max(1, width),
    0,
    0,
    0,
    2 / Math.max(1, height),
    0,
    -1,
    -1,
    1
  ]);
}
