import { AdjustmentLayer } from "../layers/AdjustmentLayer";
import { getLayerCorners } from "../geometry/TransformGeometry";
import { GroupLayer } from "../layers/GroupLayer";
import { Layer } from "../layers/Layer";

/**
 * Returns the topmost visible non-adjustment, non-group layer under the given world point.
 */
export function hitTestVisibleLayer(layers: Layer[], x: number, y: number) {
  const groupsById = new Map(
    layers
      .filter((layer): layer is GroupLayer => layer instanceof GroupLayer)
      .map((group) => [group.id, group])
  );

  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    const groupState = getLayerGroupState(layer, groupsById);

    if (!groupState.visible || !layer.visible || layer.opacity <= 0) {
      continue;
    }

    if (layer instanceof AdjustmentLayer) {
      continue;
    }

    if (layer instanceof GroupLayer) {
      continue;
    }

    if (!isPointInsideGroupChain(layer, groupsById, x, y)) {
      continue;
    }

    if (isPointInsideLayer(layer, x, y)) {
      return layer;
    }
  }

  return null;
}

/**
 * Returns the topmost visible descendant of a group under the provided world point.
 */
export function hitTestVisibleLayerInsideGroup(
  layers: Layer[],
  groupId: string,
  x: number,
  y: number
) {
  const groupsById = new Map(
    layers
      .filter((layer): layer is GroupLayer => layer instanceof GroupLayer)
      .map((group) => [group.id, group])
  );
  const group = groupsById.get(groupId);

  if (!group || !isPointInsideLayer(group, x, y)) {
    return null;
  }

  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];

    if (layer.id === groupId || !isLayerInsideGroup(layer, groupId, groupsById)) {
      continue;
    }

    const groupState = getLayerGroupState(layer, groupsById);

    if (!groupState.visible || !layer.visible || layer.opacity <= 0) {
      continue;
    }

    if (layer instanceof AdjustmentLayer) {
      continue;
    }

    if (layer instanceof GroupLayer) {
      if (isPointInsideLayer(layer, x, y)) {
        return layer;
      }

      continue;
    }

    if (!isPointInsideGroupChain(layer, groupsById, x, y)) {
      continue;
    }

    if (isPointInsideLayer(layer, x, y)) {
      return layer;
    }
  }

  return null;
}

function getLayerGroupState(layer: Layer, groupsById: Map<string, GroupLayer>) {
  let groupId = layer.groupId;
  let visible = true;
  const visitedGroupIds = new Set<string>();

  while (groupId && !visitedGroupIds.has(groupId)) {
    visitedGroupIds.add(groupId);

    const group = groupsById.get(groupId);

    if (!group) {
      break;
    }

    visible = visible && group.visible && group.opacity > 0 && !group.locked;
    groupId = group.groupId;
  }

  return { visible };
}

function isLayerInsideGroup(
  layer: Layer,
  targetGroupId: string,
  groupsById: Map<string, GroupLayer>
) {
  let groupId = layer.groupId;
  const visitedGroupIds = new Set<string>();

  while (groupId && !visitedGroupIds.has(groupId)) {
    if (groupId === targetGroupId) {
      return true;
    }

    visitedGroupIds.add(groupId);
    groupId = groupsById.get(groupId)?.groupId ?? null;
  }

  return false;
}

function isPointInsideGroupChain(
  layer: Layer,
  groupsById: Map<string, GroupLayer>,
  x: number,
  y: number
) {
  let groupId = layer.groupId;
  const visitedGroupIds = new Set<string>();

  while (groupId && !visitedGroupIds.has(groupId)) {
    visitedGroupIds.add(groupId);

    const group = groupsById.get(groupId);

    if (!group) {
      break;
    }

    if (!isPointInsideLayer(group, x, y)) {
      return false;
    }

    groupId = group.groupId;
  }

  return true;
}

/**
 * Tests whether a world-space point falls inside the layer's transformed bounds.
 */
export function isPointInsideLayer(layer: Layer, x: number, y: number) {
  const corners = getLayerCorners(layer);

  return (
    isPointInTriangle({ x, y }, corners.bottomLeft, corners.bottomRight, corners.topLeft) ||
    isPointInTriangle({ x, y }, corners.topLeft, corners.bottomRight, corners.topRight)
  );
}

function isPointInTriangle(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
) {
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);

  if (Math.abs(denominator) <= 1e-8) {
    return false;
  }

  const alpha =
    ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
  const beta =
    ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
  const gamma = 1 - alpha - beta;

  return alpha >= 0 && beta >= 0 && gamma >= 0;
}
