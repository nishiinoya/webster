import { AdjustmentLayer } from "../layers/AdjustmentLayer";
import { GroupLayer } from "../layers/GroupLayer";
import { Layer } from "../layers/Layer";

/**
 * Returns the topmost visible non-adjustment layer under the given world point.
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
  const width = layer.width * layer.scaleX;
  const height = layer.height * layer.scaleY;

  const centerX = layer.x + width / 2;
  const centerY = layer.y + height / 2;

  const radians = (-layer.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const dx = x - centerX;
  const dy = y - centerY;

  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  return (
    localX >= -width / 2 &&
    localX <= width / 2 &&
    localY >= -height / 2 &&
    localY <= height / 2
  );
}
