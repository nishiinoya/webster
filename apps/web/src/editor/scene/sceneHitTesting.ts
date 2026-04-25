import { AdjustmentLayer } from "../layers/AdjustmentLayer";
import { Layer } from "../layers/Layer";

/**
 * Returns the topmost visible non-adjustment layer under the given world point.
 */
export function hitTestVisibleLayer(layers: Layer[], x: number, y: number) {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];

    if (!layer.visible || layer.opacity <= 0) {
      continue;
    }

    if (layer instanceof AdjustmentLayer) {
      continue;
    }

    if (isPointInsideLayer(layer, x, y)) {
      return layer;
    }
  }

  return null;
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
