import { Camera2D } from "../../geometry/Camera2D";
import { invert3x3 } from "../../geometry/Matrix3";
import { getLayerCorners, getModelMatrix } from "../../geometry/TransformGeometry";
import { AdjustmentLayer } from "../../layers/AdjustmentLayer";
import { Layer } from "../../layers/Layer";
import type { BlurRegion } from "../shaders/PostProcessShaderProgram";

export function getScreenSpaceBlurRadius(
  blur: number,
  cssWidth: number,
  textureWidth: number,
  zoom = 1
) {
  const pixelScale = textureWidth / Math.max(1, cssWidth);

  return Math.max(0, blur) * pixelScale * Math.max(zoom, 0.0001);
}

export function getAdjustmentLayerBlurRegion(
  layer: AdjustmentLayer,
  camera: Camera2D,
  cssWidth: number,
  cssHeight: number,
  textureWidth: number
): BlurRegion | null {
  const radius = getScreenSpaceBlurRadius(
    layer.filters.blur * layer.opacity,
    cssWidth,
    textureWidth,
    camera.zoom
  );

  if (radius <= 0.5) {
    return null;
  }

  return {
    bounds: worldBoundsToTextureBounds(getLayerWorldBounds(layer), camera, cssWidth, cssHeight),
    inverseMatrix: getLayerInverseMatrix(layer),
    localBounds: [0, 0, 1, 1],
    radius
  };
}

export function getFullscreenBlurRegion(
  camera: Camera2D,
  cssWidth: number,
  cssHeight: number,
  textureWidth: number,
  blur: number
): BlurRegion | null {
  const radius = getScreenSpaceBlurRadius(blur, cssWidth, textureWidth);

  if (radius <= 0.5) {
    return null;
  }

  const viewportBounds = getViewportWorldBounds(camera, cssWidth, cssHeight);

  return {
    bounds: [0, 0, 1, 1],
    inverseMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    localBounds: viewportBounds,
    radius
  };
}

function getViewportWorldBounds(
  camera: Camera2D,
  cssWidth: number,
  cssHeight: number
): [number, number, number, number] {
  const topLeft = camera.screenToWorld(0, 0);
  const bottomRight = camera.screenToWorld(cssWidth, cssHeight);
  const left = Math.min(topLeft.x, bottomRight.x);
  const right = Math.max(topLeft.x, bottomRight.x);
  const bottom = Math.min(topLeft.y, bottomRight.y);
  const top = Math.max(topLeft.y, bottomRight.y);

  return [left, bottom, right - left, top - bottom];
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
  const left = clamp01(minScreenX / Math.max(1, cssWidth));
  const right = clamp01(maxScreenX / Math.max(1, cssWidth));
  const bottom = clamp01(1 - maxScreenY / Math.max(1, cssHeight));
  const top = clamp01(1 - minScreenY / Math.max(1, cssHeight));

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

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}
