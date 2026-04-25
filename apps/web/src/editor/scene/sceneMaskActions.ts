import { Layer } from "../layers/Layer";
import { ensureLayerMaskResolution } from "../masks/LayerMaskResolution";

export type LayerMaskAction =
  | "add"
  | "clear-black"
  | "clear-white"
  | "delete"
  | "disable"
  | "enable"
  | "invert"
  | "toggle-enabled";

/**
 * Applies a mask operation to the provided layer and returns the same layer.
 */
export function applyLayerMaskAction(layer: Layer, action: LayerMaskAction) {
  if (action === "delete") {
    layer.mask = null;
    return layer;
  }

  if (action === "add" && !layer.mask) {
    ensureLayerMaskResolution(layer);
    return layer;
  }

  if (!layer.mask) {
    return layer;
  }

  if (action === "enable") {
    layer.mask.enabled = true;
  }

  if (action === "disable") {
    layer.mask.enabled = false;
  }

  if (action === "toggle-enabled") {
    layer.mask.enabled = !layer.mask.enabled;
  }

  if (action === "invert") {
    layer.mask.invert();
  }

  if (action === "clear-white") {
    layer.mask.clear(255);
  }

  if (action === "clear-black") {
    layer.mask.clear(0);
  }

  return layer;
}
