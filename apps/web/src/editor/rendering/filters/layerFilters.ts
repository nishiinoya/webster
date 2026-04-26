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
 * Converts blur regions into clip-only regions for the final composite pass.
 */
export function toClipOnlyBlurRegions(regions: BlurRegion[]): BlurRegion[] {
  return regions.map((region) => ({
    ...region,
    radius: 0
  }));
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
