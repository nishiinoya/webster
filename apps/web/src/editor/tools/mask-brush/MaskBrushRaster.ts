import { Layer } from "../../layers/Layer";
import { LayerMask } from "../../masks/LayerMask";
import type { MaskDirtyRect } from "../../masks/LayerMask";
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
  let dirtyRect: MaskDirtyRect | null = null;

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
      const next = Math.round(current + (target - current) * amount);

      if (next === current) {
        continue;
      }

      mask.data[pixelIndex] = next;
      dirtyRect = expandDirtyRect(dirtyRect, x, y);
    }
  }

  return dirtyRect;
}

export function paintMaskStrokePath(
  mask: LayerMask,
  points: MaskPoint[],
  radii: MaskBrushRadii,
  options: MaskBrushPaintOptions,
  shouldPaintPixel?: MaskBrushPixelPredicate
) {
  let dirtyRect: MaskDirtyRect | null = null;
  const firstPoint = points[0];

  if (!firstPoint) {
    return null;
  }

  dirtyRect = unionDirtyRects(
    dirtyRect,
    paintMaskEllipse(mask, firstPoint, radii, options, shouldPaintPixel)
  );

  const step = Math.max(1, Math.min(radii.x, radii.y) / 4);

  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    const previous = points[pointIndex - 1];
    const point = points[pointIndex];
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / step));

    for (let index = 1; index <= steps; index += 1) {
      const amount = index / steps;

      dirtyRect = unionDirtyRects(
        dirtyRect,
        paintMaskEllipse(
          mask,
          {
            x: previous.x + (point.x - previous.x) * amount,
            y: previous.y + (point.y - previous.y) * amount
          },
          radii,
          options,
          shouldPaintPixel
        )
      );
    }
  }

  return dirtyRect;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function expandDirtyRect(rect: MaskDirtyRect | null, x: number, y: number): MaskDirtyRect {
  if (!rect) {
    return { height: 1, width: 1, x, y };
  }

  const left = Math.min(rect.x, x);
  const top = Math.min(rect.y, y);
  const right = Math.max(rect.x + rect.width, x + 1);
  const bottom = Math.max(rect.y + rect.height, y + 1);

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top
  };
}

function unionDirtyRects(a: MaskDirtyRect | null, b: MaskDirtyRect | null) {
  if (!a) {
    return b;
  }

  if (!b) {
    return a;
  }

  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top
  };
}
