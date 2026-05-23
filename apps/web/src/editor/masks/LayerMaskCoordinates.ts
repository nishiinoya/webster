import { ImageLayer } from "../layers/ImageLayer";
import { Layer } from "../layers/Layer";
import { TextLayer } from "../layers/TextLayer";
import { getTextMaskFrame } from "../rendering/text/BitmapText";
import type { LayerMask } from "./LayerMask";

export type UnitPoint = {
  x: number;
  y: number;
};

export type LayerMaskFrame = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export function getLayerMaskFrame(layer: Layer): LayerMaskFrame {
  if (layer instanceof TextLayer) {
    return layer.lastTextMaskFrame ?? getTextMaskFrame(layer);
  }

  return {
    height: layer.height,
    width: layer.width,
    x: 0,
    y: 0
  };
}

export function layerLocalUnitToMaskUnit(layer: Layer, unitPoint: UnitPoint): UnitPoint {
  const frame = getLayerMaskFrame(layer);
  const localX = unitPoint.x * layer.width;
  const localY = unitPoint.y * layer.height;

  return {
    x: (localX - frame.x) / Math.max(1e-6, frame.width),
    y: (localY - frame.y) / Math.max(1e-6, frame.height)
  };
}

export function maskUnitToLayerLocalUnit(layer: Layer, maskUnitPoint: UnitPoint): UnitPoint {
  const frame = getLayerMaskFrame(layer);
  const localX = frame.x + maskUnitPoint.x * frame.width;
  const localY = frame.y + maskUnitPoint.y * frame.height;

  return {
    x: localX / Math.max(1e-6, layer.width),
    y: localY / Math.max(1e-6, layer.height)
  };
}

export function layerLocalUnitToMaskPixel(
  layer: Layer,
  mask: LayerMask,
  unitPoint: UnitPoint
): UnitPoint {
  const maskUnit = layerLocalUnitToMaskUnit(layer, unitPoint);

  return {
    x: maskUnit.x * Math.max(1, mask.width - 1) + 0.5,
    y: (1 - maskUnit.y) * Math.max(1, mask.height - 1) + 0.5
  };
}

export function maskPixelToLayerLocalUnit(
  layer: Layer,
  mask: LayerMask,
  maskX: number,
  maskY: number
): UnitPoint {
  return maskUnitToLayerLocalUnit(layer, {
    x: maskX / Math.max(1, mask.width - 1),
    y: 1 - maskY / Math.max(1, mask.height - 1)
  });
}

export function isLayerLocalUnitMaskable(
  layer: Layer,
  unitPoint: UnitPoint,
  margin: UnitPoint = { x: 0, y: 0 }
) {
  const maskUnit = layerLocalUnitToMaskUnit(layer, unitPoint);

  if (
    maskUnit.x < -margin.x ||
    maskUnit.x > 1 + margin.x ||
    maskUnit.y < -margin.y ||
    maskUnit.y > 1 + margin.y
  ) {
    return false;
  }

  if (layer.crop) {
    const frame = getLayerMaskFrame(layer);
    const localMarginX = margin.x * frame.width;
    const localMarginY = margin.y * frame.height;
    const localX = unitPoint.x * layer.width;
    const localY = unitPoint.y * layer.height;

    if (
      localX < layer.crop.left - localMarginX ||
      localX > layer.crop.right + localMarginX ||
      localY < layer.crop.bottom - localMarginY ||
      localY > layer.crop.top + localMarginY
    ) {
      return false;
    }
  }

  if (layer instanceof ImageLayer && !isInsideImageGeometryBounds(layer, unitPoint, margin)) {
    return false;
  }

  return true;
}

export function getImageLayerRenderedUnitCorners(layer: ImageLayer) {
  const { corners, crop } = layer.geometry;

  return {
    bottomLeft: interpolateImageGeometryPoint(corners, crop.left, crop.bottom),
    bottomRight: interpolateImageGeometryPoint(corners, crop.right, crop.bottom),
    topLeft: interpolateImageGeometryPoint(corners, crop.left, crop.top),
    topRight: interpolateImageGeometryPoint(corners, crop.right, crop.top)
  };
}

export function isImageLayerGeometryCropBakedIntoCorners(layer: ImageLayer) {
  const { corners, crop } = layer.geometry;
  const epsilon = 1e-4;

  return (
    areUnitPointsClose(corners.bottomLeft, { x: crop.left, y: crop.bottom }, epsilon) &&
    areUnitPointsClose(corners.bottomRight, { x: crop.right, y: crop.bottom }, epsilon) &&
    areUnitPointsClose(corners.topLeft, { x: crop.left, y: crop.top }, epsilon) &&
    areUnitPointsClose(corners.topRight, { x: crop.right, y: crop.top }, epsilon)
  );
}

function isInsideImageGeometryBounds(layer: ImageLayer, unitPoint: UnitPoint, margin: UnitPoint) {
  const corners = getImageLayerRenderedUnitCorners(layer);
  const minX = Math.min(
    corners.bottomLeft.x,
    corners.bottomRight.x,
    corners.topLeft.x,
    corners.topRight.x
  );
  const maxX = Math.max(
    corners.bottomLeft.x,
    corners.bottomRight.x,
    corners.topLeft.x,
    corners.topRight.x
  );
  const minY = Math.min(
    corners.bottomLeft.y,
    corners.bottomRight.y,
    corners.topLeft.y,
    corners.topRight.y
  );
  const maxY = Math.max(
    corners.bottomLeft.y,
    corners.bottomRight.y,
    corners.topLeft.y,
    corners.topRight.y
  );

  return (
    unitPoint.x >= minX - margin.x &&
    unitPoint.x <= maxX + margin.x &&
    unitPoint.y >= minY - margin.y &&
    unitPoint.y <= maxY + margin.y
  );
}

function interpolateImageGeometryPoint(
  corners: ImageLayer["geometry"]["corners"],
  xRatio: number,
  yRatio: number
): UnitPoint {
  const bottom = interpolateUnitPoint(corners.bottomLeft, corners.bottomRight, xRatio);
  const top = interpolateUnitPoint(corners.topLeft, corners.topRight, xRatio);

  return interpolateUnitPoint(bottom, top, yRatio);
}

function interpolateUnitPoint(start: UnitPoint, end: UnitPoint, amount: number): UnitPoint {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount
  };
}

function areUnitPointsClose(left: UnitPoint, right: UnitPoint, epsilon: number) {
  return Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon;
}
