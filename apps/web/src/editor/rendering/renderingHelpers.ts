import { invert3x3, transformPoint3x3 } from "../geometry/Matrix3";
import { getModelMatrix } from "../geometry/TransformGeometry";
import type { LayerFilterSettings } from "../layers/Layer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { StrokeLayer } from "../layers/StrokeLayer";
import type { StrokeSelectionClip } from "../layers/StrokeLayer";
import type { SelectionMask } from "../selection/SelectionManager";

/**
 * Guards against invalid float buffers before uploading them to WebGL.
 */
export function isFiniteFloatArray(values: Float32Array) {
  for (const value of values) {
    if (!Number.isFinite(value)) {
      return false;
    }
  }

  return true;
}

/**
 * Expands a drop shadow into the draw passes used by the current approximation.
 */
export function getDropShadowPasses(filters: LayerFilterSettings) {
  const blur = filters.dropShadowBlur;

  if (blur <= 0.5) {
    return [{ opacity: 1, x: 0, y: 0 }];
  }

  const spread = blur * 0.35;
  const diagonalSpread = spread * 0.7071;

  return [
    { opacity: 0.2, x: 0, y: 0 },
    { opacity: 0.1, x: spread, y: 0 },
    { opacity: 0.1, x: -spread, y: 0 },
    { opacity: 0.1, x: 0, y: spread },
    { opacity: 0.1, x: 0, y: -spread },
    { opacity: 0.1, x: diagonalSpread, y: diagonalSpread },
    { opacity: 0.1, x: -diagonalSpread, y: diagonalSpread },
    { opacity: 0.1, x: diagonalSpread, y: -diagonalSpread },
    { opacity: 0.1, x: -diagonalSpread, y: -diagonalSpread }
  ];
}

/**
 * Returns the local polygon points for non-rectangular shape layers.
 */
export function getPolygonShapePoints(layer: ShapeLayer) {
  const width = layer.width;
  const height = layer.height;

  if (layer.shape === "custom") {
    return layer.customPath.map((point) => ({ ...point }));
  }

  if (layer.shape === "triangle") {
    return [
      { x: width / 2, y: height },
      { x: width, y: 0 },
      { x: 0, y: 0 }
    ];
  }

  if (layer.shape === "diamond") {
    return [
      { x: width / 2, y: height },
      { x: width, y: height / 2 },
      { x: width / 2, y: 0 },
      { x: 0, y: height / 2 }
    ];
  }

  if (layer.shape === "arrow") {
    return [
      { x: 0, y: height * 0.25 },
      { x: width * 0.62, y: height * 0.25 },
      { x: width * 0.62, y: 0 },
      { x: width, y: height * 0.5 },
      { x: width * 0.62, y: height },
      { x: width * 0.62, y: height * 0.75 },
      { x: 0, y: height * 0.75 }
    ];
  }

  return [];
}

/**
 * Converts a world-space stroke selection clip back into the layer's local space.
 */
export function getLayerSelectionClip(
  layer: StrokeLayer,
  clip: StrokeSelectionClip | null
): {
  bounds: { height: number; width: number; x: number; y: number };
  inverted: boolean;
  mask?: SelectionMask;
  points?: Array<{ x: number; y: number }>;
  shape: "ellipse" | "lasso" | "mask" | "rectangle";
} | null {
  if (!clip) {
    return null;
  }

  if (clip.coordinateSpace === "layer") {
    return {
      bounds: clip.bounds,
      inverted: clip.inverted,
      mask: clip.mask,
      points: clip.shape === "lasso" ? clip.points?.map((point) => ({ ...point })) : undefined,
      shape: getShaderSelectionShape(clip)
    };
  }

  const inverseModel = invert3x3(getModelMatrix(layer));

  if (!inverseModel) {
    return null;
  }

  const bounds = clip.bounds;
  const points = clip.points?.map((point) => transformPoint3x3(inverseModel, point.x, point.y));
  const corners = [
    transformPoint3x3(inverseModel, bounds.x, bounds.y),
    transformPoint3x3(inverseModel, bounds.x + bounds.width, bounds.y),
    transformPoint3x3(inverseModel, bounds.x + bounds.width, bounds.y + bounds.height),
    transformPoint3x3(inverseModel, bounds.x, bounds.y + bounds.height)
  ];
  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const maxY = Math.max(...corners.map((corner) => corner.y));

  return {
    bounds: {
      height: maxY - minY,
      width: maxX - minX,
      x: minX,
      y: minY
    },
    inverted: clip.inverted,
    mask: clip.mask,
    points: clip.shape === "lasso" ? points : undefined,
    shape: getShaderSelectionShape(clip)
  };
}

function getShaderSelectionShape(clip: StrokeSelectionClip) {
  if (clip.shape === "ellipse" || clip.shape === "lasso" || clip.shape === "mask") {
    return clip.shape;
  }

  return "rectangle";
}
