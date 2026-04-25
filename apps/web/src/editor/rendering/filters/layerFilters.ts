import { Camera2D } from "../../geometry/Camera2D";
import { invert3x3 } from "../../geometry/Matrix3";
import { getLayerCorners, getModelMatrix } from "../../geometry/TransformGeometry";
import { AdjustmentLayer } from "../../layers/AdjustmentLayer";
import { defaultLayerFilters, Layer } from "../../layers/Layer";
import type { LayerFilterAdjustment, LayerFilterSettings } from "../../layers/Layer";
import type { BlurRegion } from "../shaders/PostProcessShaderProgram";

export type EffectiveLayerFilters = {
  adjustments: LayerFilterAdjustment[];
  filters: LayerFilterSettings;
};

/**
 * Resolves the effective per-layer filter stack, including adjustment layers above each layer.
 */
export function getEffectiveLayerFilters(layers: Layer[]) {
  const effectiveFilters = new Map<Layer, EffectiveLayerFilters>();
  let adjustmentFiltersAbove: LayerFilterAdjustment[] = [];

  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];

    if (layer instanceof AdjustmentLayer) {
      if (layer.visible && layer.opacity > 0) {
        adjustmentFiltersAbove = [
          {
            bounds: getLayerWorldBounds(layer),
            filters: scaleLayerFilters(layer.filters, layer.opacity),
            inverseMatrix: getLayerInverseMatrix(layer),
            size: [1, 1]
          },
          ...adjustmentFiltersAbove
        ];
      }

      effectiveFilters.set(layer, {
        adjustments: [],
        filters: defaultLayerFilters
      });
      continue;
    }

    effectiveFilters.set(layer, {
      adjustments: adjustmentFiltersAbove,
      filters: layer.filters
    });
  }

  return layers.map(
    (layer): EffectiveLayerFilters =>
      effectiveFilters.get(layer) ?? {
        adjustments: [],
        filters: layer.filters
      }
  );
}

/**
 * Combines two filter objects into one clamped filter state.
 */
export function combineLayerFilters(base: LayerFilterSettings, overlay: LayerFilterSettings) {
  return {
    brightness: clampFilter(base.brightness + overlay.brightness, -1, 1),
    blur: clampFilter(base.blur + overlay.blur, 0, 64),
    contrast: clampFilter(base.contrast + overlay.contrast, -1, 1),
    dropShadowBlur: clampFilter(base.dropShadowBlur + overlay.dropShadowBlur, 0, 80),
    dropShadowOffsetX: clampFilter(
      base.dropShadowOffsetX + overlay.dropShadowOffsetX - defaultLayerFilters.dropShadowOffsetX,
      -240,
      240
    ),
    dropShadowOffsetY: clampFilter(
      base.dropShadowOffsetY + overlay.dropShadowOffsetY - defaultLayerFilters.dropShadowOffsetY,
      -240,
      240
    ),
    dropShadowOpacity: combineAmountFilter(base.dropShadowOpacity, overlay.dropShadowOpacity),
    grayscale: combineAmountFilter(base.grayscale, overlay.grayscale),
    hue: clampFilter(base.hue + overlay.hue, -180, 180),
    invert: combineAmountFilter(base.invert, overlay.invert),
    saturation: clampFilter(base.saturation + overlay.saturation, -1, 1),
    sepia: combineAmountFilter(base.sepia, overlay.sepia),
    shadow: clampFilter(base.shadow + overlay.shadow, -1, 1)
  };
}

/**
 * Returns whether any visible adjustment layer currently requires a blur pass.
 */
export function hasAdjustmentBlur(layers: Layer[]) {
  return layers.some(
    (layer) =>
      layer instanceof AdjustmentLayer &&
      layer.visible &&
      layer.opacity > 0 &&
      layer.filters.blur * layer.opacity > 0.5
  );
}

/**
 * Finds the last layer index that still participates in the adjustment blur stack.
 */
export function getTopmostAdjustmentBlurIndex(layers: Layer[]) {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];

    if (
      layer instanceof AdjustmentLayer &&
      layer.visible &&
      layer.opacity > 0 &&
      layer.filters.blur * layer.opacity > 0.5
    ) {
      return index;
    }
  }

  return layers.length - 1;
}

/**
 * Builds the blur region descriptor for a single adjustment layer.
 */
export function getAdjustmentLayerBlurRegion(
  layer: AdjustmentLayer,
  camera: Camera2D,
  cssWidth: number,
  cssHeight: number,
  textureWidth: number
): BlurRegion | null {
  const pixelScale = textureWidth / Math.max(1, cssWidth);
  const radius = layer.filters.blur * layer.opacity * pixelScale;

  if (radius <= 0.5) {
    return null;
  }

  return {
    bounds: worldBoundsToTextureBounds(getLayerWorldBounds(layer), camera, cssWidth, cssHeight),
    inverseMatrix: getLayerInverseMatrix(layer),
    radius: Math.min(radius, textureWidth * 0.12),
    size: [1, 1]
  };
}

/**
 * Converts blur regions into clip-only regions for the final composite pass.
 */
export function toClipOnlyBlurRegions(regions: BlurRegion[]): BlurRegion[] {
  return regions.map((region) => ({
    ...region,
    radius: 0
  }));
}

/**
 * Collects the visible adjustment blur regions used by the post-process shader.
 */
export function getAdjustmentBlurRegions(
  layers: Layer[],
  camera: Camera2D,
  cssWidth: number,
  cssHeight: number,
  textureWidth: number,
  textureHeight: number
): BlurRegion[] {
  const pixelScale = textureWidth / Math.max(1, cssWidth);
  const regions: BlurRegion[] = [];

  for (const layer of layers) {
    if (!(layer instanceof AdjustmentLayer) || !layer.visible || layer.opacity <= 0) {
      continue;
    }

    const radius = layer.filters.blur * layer.opacity * pixelScale;

    if (radius <= 0.5) {
      continue;
    }

    regions.push({
      bounds: worldBoundsToTextureBounds(getLayerWorldBounds(layer), camera, cssWidth, cssHeight),
      inverseMatrix: getLayerInverseMatrix(layer),
      radius: Math.min(radius, Math.max(textureWidth, textureHeight) * 0.08),
      size: [1, 1]
    });

    if (regions.length >= 4) {
      break;
    }
  }

  return regions;
}

function scaleLayerFilters(filters: LayerFilterSettings, amount: number) {
  return {
    brightness: filters.brightness * amount,
    blur: filters.blur * amount,
    contrast: filters.contrast * amount,
    dropShadowBlur: filters.dropShadowBlur * amount,
    dropShadowOffsetX:
      defaultLayerFilters.dropShadowOffsetX +
      (filters.dropShadowOffsetX - defaultLayerFilters.dropShadowOffsetX) * amount,
    dropShadowOffsetY:
      defaultLayerFilters.dropShadowOffsetY +
      (filters.dropShadowOffsetY - defaultLayerFilters.dropShadowOffsetY) * amount,
    dropShadowOpacity: filters.dropShadowOpacity * amount,
    grayscale: filters.grayscale * amount,
    hue: filters.hue * amount,
    invert: filters.invert * amount,
    saturation: filters.saturation * amount,
    sepia: filters.sepia * amount,
    shadow: filters.shadow * amount
  };
}

function combineAmountFilter(base: number, overlay: number) {
  return clampFilter(1 - (1 - base) * (1 - overlay), 0, 1);
}

function clampFilter(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function worldBoundsToTextureBounds(
  bounds: [number, number, number, number],
  camera: Camera2D,
  cssWidth: number,
  cssHeight: number
): [number, number, number, number] {
  const [x, y, width, height] = bounds;
  const screenCorners = [
    camera.worldToScreen(x, y),
    camera.worldToScreen(x + width, y),
    camera.worldToScreen(x + width, y + height),
    camera.worldToScreen(x, y + height)
  ];
  const minScreenX = Math.min(...screenCorners.map((corner) => corner.x));
  const maxScreenX = Math.max(...screenCorners.map((corner) => corner.x));
  const minScreenY = Math.min(...screenCorners.map((corner) => corner.y));
  const maxScreenY = Math.max(...screenCorners.map((corner) => corner.y));
  const left = clampFilter(minScreenX / Math.max(1, cssWidth), 0, 1);
  const right = clampFilter(maxScreenX / Math.max(1, cssWidth), 0, 1);
  const bottom = clampFilter(1 - maxScreenY / Math.max(1, cssHeight), 0, 1);
  const top = clampFilter(1 - minScreenY / Math.max(1, cssHeight), 0, 1);

  return [left, bottom, Math.max(0, right - left), Math.max(0, top - bottom)];
}

function getLayerWorldBounds(layer: Layer): [number, number, number, number] {
  const corners = getLayerCorners(layer);
  const xs = [
    corners.topLeft.x,
    corners.topRight.x,
    corners.bottomRight.x,
    corners.bottomLeft.x
  ];
  const ys = [
    corners.topLeft.y,
    corners.topRight.y,
    corners.bottomRight.y,
    corners.bottomLeft.y
  ];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return [minX, minY, maxX - minX, maxY - minY];
}

function getLayerInverseMatrix(
  layer: Layer
): [number, number, number, number, number, number, number, number, number] {
  const inverseMatrix = invert3x3(getModelMatrix(layer));
  const matrix = inverseMatrix ?? new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  return [
    matrix[0],
    matrix[1],
    matrix[2],
    matrix[3],
    matrix[4],
    matrix[5],
    matrix[6],
    matrix[7],
    matrix[8]
  ];
}
