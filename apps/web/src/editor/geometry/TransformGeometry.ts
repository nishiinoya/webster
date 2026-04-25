/**
 * Geometry helpers for transform handles, rotated layer bounds, and model matrices.
 */
import { Camera2D } from "./Camera2D";
import { Layer } from "../layers/Layer";

export type TransformHandleId =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left"
  | "rotate";

export type TransformHandle = {
  id: TransformHandleId;
  x: number;
  y: number;
};

export type LayerCorners = {
  bottomLeft: Point;
  bottomRight: Point;
  topRight: Point;
  topLeft: Point;
};

export type Point = {
  x: number;
  y: number;
};

export type TransformRectangle = {
  height: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width: number;
  x: number;
  y: number;
};

/**
 * Returns the rendered layer size after scale is applied.
 */
export function getLayerSize(layer: Layer) {
  return {
    width: layer.width * layer.scaleX,
    height: layer.height * layer.scaleY
  };
}

/**
 * Returns the center point of the scaled layer rectangle.
 */
export function getLayerCenter(layer: Layer) {
  const { width, height } = getLayerSize(layer);

  return {
    x: layer.x + width / 2,
    y: layer.y + height / 2
  };
}

/**
 * Returns the four transformed corners for a possibly rotated layer.
 */
export function getLayerCorners(layer: Layer): LayerCorners {
  const { width, height } = getLayerSize(layer);
  const center = getLayerCenter(layer);

  return {
    bottomLeft: rotatePoint({ x: layer.x, y: layer.y }, center, layer.rotation),
    bottomRight: rotatePoint({ x: layer.x + width, y: layer.y }, center, layer.rotation),
    topRight: rotatePoint({ x: layer.x + width, y: layer.y + height }, center, layer.rotation),
    topLeft: rotatePoint({ x: layer.x, y: layer.y + height }, center, layer.rotation)
  };
}

/**
 * Builds the visible resize and rotation handles for the current camera zoom level.
 */
export function getTransformHandles(layer: Layer, camera: Camera2D): TransformHandle[] {
  const corners = getLayerCorners(layer);
  const rotationGap = 34 / camera.zoom;
  const topCenter = midpoint(corners.topLeft, corners.topRight);
  const center = getLayerCenter(layer);
  const rotateDirection = normalize({
    x: topCenter.x - center.x,
    y: topCenter.y - center.y
  });

  return [
    { id: "top-left", ...corners.topLeft },
    { id: "top", ...topCenter },
    { id: "top-right", ...corners.topRight },
    { id: "right", ...midpoint(corners.topRight, corners.bottomRight) },
    { id: "bottom-right", ...corners.bottomRight },
    { id: "bottom", ...midpoint(corners.bottomLeft, corners.bottomRight) },
    { id: "bottom-left", ...corners.bottomLeft },
    { id: "left", ...midpoint(corners.topLeft, corners.bottomLeft) },
    {
      id: "rotate",
      x: topCenter.x + rotateDirection.x * rotationGap,
      y: topCenter.y + rotateDirection.y * rotationGap
    }
  ];
}

/**
 * Rotates a vector around the origin by the supplied angle in degrees.
 */
export function rotateVector(point: Point, rotation: number) {
  const radians = degreesToRadians(rotation);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

/**
 * Rotates a point around a center point by the supplied angle in degrees.
 */
export function rotatePoint(point: Point, center: Point, rotation: number) {
  const rotated = rotateVector(
    {
      x: point.x - center.x,
      y: point.y - center.y
    },
    rotation
  );

  return {
    x: center.x + rotated.x,
    y: center.y + rotated.y
  };
}

/**
 * Returns the midpoint between two points.
 */
export function midpoint(a: Point, b: Point) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

/**
 * Returns the Euclidean distance between two points.
 */
export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Normalizes a vector, falling back to a unit-safe divisor for zero-length input.
 */
export function normalize(point: Point) {
  const length = Math.hypot(point.x, point.y) || 1;

  return {
    x: point.x / length,
    y: point.y / length
  };
}

/**
 * Converts an angle from degrees to radians.
 */
export function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/**
 * Builds a column-major model matrix for a scaled and rotated rectangle.
 */
export function getModelMatrix(rectangle: TransformRectangle) {
  const width = rectangle.width * (rectangle.scaleX ?? 1);
  const height = rectangle.height * (rectangle.scaleY ?? 1);
  const rotation = degreesToRadians(rectangle.rotation ?? 0);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const centerX = rectangle.x + width / 2;
  const centerY = rectangle.y + height / 2;
  const translateX = centerX - (cos * width) / 2 + (sin * height) / 2;
  const translateY = centerY - (sin * width) / 2 - (cos * height) / 2;

  return new Float32Array([
    cos * width,
    sin * width,
    0,
    -sin * height,
    cos * height,
    0,
    translateX,
    translateY,
    1
  ]);
}
