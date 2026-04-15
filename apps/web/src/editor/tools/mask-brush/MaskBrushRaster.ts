import { Layer } from "../../layers/Layer";
import { LayerMask } from "../../masks/LayerMask";
import type { MaskBrushOptions } from "./MaskBrushTypes";

export type MaskBrushPaintOptions = MaskBrushOptions;
export type MaskBrushPixelPredicate = (x: number, y: number) => boolean;

export type MaskPoint = {
  x: number;
  y: number;
};

export type MaskBrushRadii = {
  x: number;
  y: number;
};

export function getBrushRadiiInMaskSpace(
  layer: Layer,
  mask: LayerMask,
  brushSizeInScreenPixels: number,
  cameraZoom: number
): MaskBrushRadii {
  const renderedWidth = layer.width * Math.abs(layer.scaleX);
  const renderedHeight = layer.height * Math.abs(layer.scaleY);
  const maskPixelsPerWorldX = mask.width / Math.max(1e-6, renderedWidth);
  const maskPixelsPerWorldY = mask.height / Math.max(1e-6, renderedHeight);
  const brushRadiusInWorld = brushSizeInScreenPixels / Math.max(1e-6, cameraZoom) / 2;

  return {
    x: Math.max(0.5, brushRadiusInWorld * maskPixelsPerWorldX),
    y: Math.max(0.5, brushRadiusInWorld * maskPixelsPerWorldY)
  };
}

export function paintMaskEllipse(
  mask: LayerMask,
  point: MaskPoint,
  radii: MaskBrushRadii,
  options: MaskBrushPaintOptions,
  shouldPaintPixel?: MaskBrushPixelPredicate
) {
  const minX = Math.max(0, Math.floor(point.x - radii.x));
  const maxX = Math.min(mask.width - 1, Math.ceil(point.x + radii.x));
  const minY = Math.max(0, Math.floor(point.y - radii.y));
  const maxY = Math.min(mask.height - 1, Math.ceil(point.y + radii.y));
  const target = options.mode === "reveal" ? 255 : 0;
  const opacity = clamp(options.opacity, 0, 1);
  const edgeSoftness = 0.18;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x + 0.5 - point.x) / radii.x;
      const dy = (y + 0.5 - point.y) / radii.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 1) {
        continue;
      }

      if (shouldPaintPixel && !shouldPaintPixel(x, y)) {
        continue;
      }

      const falloff = clamp((1 - distance) / edgeSoftness, 0, 1);
      const amount = opacity * falloff;
      const pixelIndex = y * mask.width + x;
      const current = mask.data[pixelIndex];

      mask.data[pixelIndex] = Math.round(current + (target - current) * amount);
    }
  }
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
