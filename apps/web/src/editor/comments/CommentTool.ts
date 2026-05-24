import { invert3x3, transformPoint3x3 } from "../geometry/Matrix3";
import { getModelMatrix } from "../geometry/TransformGeometry";
import type { Layer } from "../layers/Layer";

import type { PendingCommentDraft } from "./CommentModel";

export type CommentToolContext = {
  clientToWorldPoint: (clientX: number, clientY: number) => { x: number; y: number };
  hitTestLayerAtClientPoint: (
    clientX: number,
    clientY: number
  ) => { id: string; layer?: Layer | null; name: string } | null;
};

export function startPendingCommentAtClientPoint(
  context: CommentToolContext,
  clientX: number,
  clientY: number
): PendingCommentDraft {
  const world = context.clientToWorldPoint(clientX, clientY);
  const hitLayer = context.hitTestLayerAtClientPoint(clientX, clientY);
  const localPoint = hitLayer?.layer ? getLayerLocalPoint(hitLayer.layer, world.x, world.y) : null;

  return {
    layerId: hitLayer?.id ?? null,
    localX: localPoint?.x ?? null,
    localY: localPoint?.y ?? null,
    text: "",
    x: world.x,
    y: world.y
  };
}

function getLayerLocalPoint(layer: Layer, worldX: number, worldY: number) {
  const inverseMatrix = invert3x3(getModelMatrix(layer));

  if (!inverseMatrix) {
    return null;
  }

  const localPoint = transformPoint3x3(inverseMatrix, worldX, worldY);

  if (!Number.isFinite(localPoint.x) || !Number.isFinite(localPoint.y)) {
    return null;
  }

  return localPoint;
}
