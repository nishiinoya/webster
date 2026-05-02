/** Renderer for dimmed selections and marching-ants outlines. */
import { Camera2D } from "../../geometry/Camera2D";
import { distance, getModelMatrix, midpoint } from "../../geometry/TransformGeometry";
import { defaultLayerFilters } from "../../layers/Layer";
import type { SelectionSnapshot } from "../../selection/SelectionManager";
import type { SelectionMask } from "../../selection/SelectionManager";
import { Quad } from "../geometry/Quad";
import { SolidColorShaderProgram } from "../shaders/SolidColorShaderProgram";

type Rectangle = {
  height: number;
  rotation?: number;
  width: number;
  x: number;
  y: number;
};

type Point = {
  x: number;
  y: number;
};

type MaskEdgeSegment = {
  end: Point;
  start: Point;
};

type MaskEdgeCacheEntry = {
  height: number;
  segments: MaskEdgeSegment[];
  width: number;
};

export class SelectionOverlayRenderer {
  private readonly maskEdgeCache = new WeakMap<SelectionMask, MaskEdgeCacheEntry>();
  private readonly maskTextures = new Set<WebGLTexture>();
  private readonly maskTextureCache = new WeakMap<SelectionMask, WebGLTexture>();

  constructor(
    private readonly gl: WebGLRenderingContext,
    private readonly solidColorShaderProgram: SolidColorShaderProgram,
    private readonly quad: Quad
  ) {}

  render(
    selection: SelectionSnapshot,
    camera: Camera2D,
    documentBounds: { height: number; width: number; x: number; y: number }
  ) {
    const bounds = selection.bounds;
    const lineWidth = Math.max(1.25 / camera.zoom, 0.45);
    const dashLength = 8 / Math.max(camera.zoom, 1e-6);
    const gapLength = 5 / Math.max(camera.zoom, 1e-6);
    const dashOffset =
      ((window.performance.now() / 120) * (dashLength + gapLength)) %
      (dashLength + gapLength);

    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setFilters(defaultLayerFilters);
    this.solidColorShaderProgram.setAdjustmentFilters([]);
    this.drawDim(selection, documentBounds, camera);
    this.solidColorShaderProgram.setColor([0.02, 0.025, 0.03, 0.95]);

    if (selection.shape === "mask" && selection.mask) {
      this.drawMaskOutline(selection, lineWidth);
    } else if (selection.shape === "ellipse") {
      this.drawEllipseOutline(bounds, lineWidth * 1.8);
    } else if (selection.shape === "lasso" && selection.points && selection.points.length > 1) {
      this.drawPolylineOutline(selection.points, true, lineWidth * 1.8);
    } else {
      this.drawRectangleOutline(bounds, lineWidth * 1.8);
    }

    this.solidColorShaderProgram.setColor(
      selection.isDraft ? [0.94, 0.78, 0.36, 1] : [0.96, 0.98, 1, 1]
    );

    if (selection.shape === "mask" && selection.mask) {
      this.drawMaskOutline(selection, lineWidth * 0.72, true);
    } else if (selection.shape === "ellipse") {
      this.drawDashedEllipseOutline(bounds, lineWidth, dashLength, gapLength, dashOffset);
    } else if (selection.shape === "lasso" && selection.points && selection.points.length > 1) {
      this.drawDashedPolyline(selection.points, true, lineWidth, dashLength, gapLength, dashOffset);
    } else {
      this.drawDashedRectangleOutline(bounds, lineWidth, dashLength, gapLength, dashOffset);
    }
  }

  dispose() {
    for (const texture of this.maskTextures) {
      this.gl.deleteTexture(texture);
    }

    this.maskTextures.clear();
  }

  private drawDim(
    selection: SelectionSnapshot,
    documentBounds: { height: number; width: number; x: number; y: number },
    camera: Camera2D
  ) {
    this.solidColorShaderProgram.setColor(
      selection.isDraft ? [0.02, 0.025, 0.03, 0.18] : [0.02, 0.025, 0.03, 0.34]
    );

    if (selection.shape === "mask" && selection.mask) {
      this.drawMaskDim(selection, documentBounds);
      return;
    }

    if (selection.shape === "ellipse") {
      this.drawEllipseDim(selection, documentBounds, camera);
      return;
    }

    if (selection.shape === "lasso" && selection.points && selection.points.length > 2) {
      this.drawLassoDim(selection, documentBounds, camera);
      return;
    }

    if (selection.inverted && !selection.isDraft) {
      this.drawRectangle(clampRectangleToBounds(selection.bounds, documentBounds));
      return;
    }

    this.drawRectangleDim(selection.bounds, documentBounds);
  }

  private drawMaskDim(selection: SelectionSnapshot, documentBounds: Rectangle) {
    if (!selection.mask) {
      this.drawRectangleDim(selection.bounds, documentBounds);
      return;
    }

    const maskTexture = this.getMaskTexture(selection.mask);

    if (selection.inverted && !selection.isDraft) {
      this.drawMaskedRectangle(selection.bounds, maskTexture, false);
      return;
    }

    this.drawRectangleDim(selection.bounds, documentBounds);
    this.drawMaskedRectangle(selection.bounds, maskTexture, true);

    this.solidColorShaderProgram.setColor(
      selection.isDraft ? [0.94, 0.78, 0.36, 0.1] : [0.32, 0.64, 1, 0.1]
    );
    this.drawMaskedRectangle(selection.bounds, maskTexture, false);
    this.solidColorShaderProgram.setColor(
      selection.isDraft ? [0.02, 0.025, 0.03, 0.18] : [0.02, 0.025, 0.03, 0.34]
    );
  }

  private drawRectangleDim(selectionBounds: Rectangle, documentBounds: Rectangle) {
    const selected = clampRectangleToBounds(selectionBounds, documentBounds);
    const documentRight = documentBounds.x + documentBounds.width;
    const documentTop = documentBounds.y + documentBounds.height;
    const selectedRight = selected.x + selected.width;
    const selectedTop = selected.y + selected.height;

    this.drawRectangleIfVisible({
      x: documentBounds.x,
      y: selectedTop,
      width: documentBounds.width,
      height: documentTop - selectedTop
    });
    this.drawRectangleIfVisible({
      x: documentBounds.x,
      y: documentBounds.y,
      width: documentBounds.width,
      height: selected.y - documentBounds.y
    });
    this.drawRectangleIfVisible({
      x: documentBounds.x,
      y: selected.y,
      width: selected.x - documentBounds.x,
      height: selected.height
    });
    this.drawRectangleIfVisible({
      x: selectedRight,
      y: selected.y,
      width: documentRight - selectedRight,
      height: selected.height
    });
  }

  private drawEllipseDim(selection: SelectionSnapshot, documentBounds: Rectangle, camera: Camera2D) {
    const centerX = selection.bounds.x + selection.bounds.width / 2;
    const centerY = selection.bounds.y + selection.bounds.height / 2;
    const radiusX = Math.max(1e-6, selection.bounds.width / 2);
    const radiusY = Math.max(1e-6, selection.bounds.height / 2);
    const targetBandHeight = 2 / Math.max(camera.zoom, 1e-6);
    const bandCount = Math.max(
      24,
      Math.min(360, Math.ceil(documentBounds.height / Math.max(targetBandHeight, 1e-6)))
    );
    const bandHeight = documentBounds.height / bandCount;
    const documentRight = documentBounds.x + documentBounds.width;

    for (let bandIndex = 0; bandIndex < bandCount; bandIndex += 1) {
      const y = documentBounds.y + bandIndex * bandHeight;
      const sampleY = y + bandHeight / 2;
      const normalizedY = (sampleY - centerY) / radiusY;
      const isInsideEllipseY = Math.abs(normalizedY) <= 1;
      const halfWidth = isInsideEllipseY
        ? Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY)) * radiusX
        : 0;
      const ellipseLeft = Math.max(documentBounds.x, centerX - halfWidth);
      const ellipseRight = Math.min(documentRight, centerX + halfWidth);

      if (selection.inverted && !selection.isDraft) {
        if (!isInsideEllipseY) {
          continue;
        }

        this.drawRectangleIfVisible({
          x: ellipseLeft,
          y,
          width: ellipseRight - ellipseLeft,
          height: bandHeight
        });
        continue;
      }

      if (!isInsideEllipseY) {
        this.drawRectangleIfVisible({
          x: documentBounds.x,
          y,
          width: documentBounds.width,
          height: bandHeight
        });
        continue;
      }

      this.drawRectangleIfVisible({
        x: documentBounds.x,
        y,
        width: ellipseLeft - documentBounds.x,
        height: bandHeight
      });
      this.drawRectangleIfVisible({
        x: ellipseRight,
        y,
        width: documentRight - ellipseRight,
        height: bandHeight
      });
    }
  }

  private drawLassoDim(selection: SelectionSnapshot, documentBounds: Rectangle, camera: Camera2D) {
    const points = selection.points;

    if (!points || points.length < 3) {
      return;
    }

    const targetBandHeight = 2 / Math.max(camera.zoom, 1e-6);
    const bandCount = Math.max(
      24,
      Math.min(480, Math.ceil(documentBounds.height / Math.max(targetBandHeight, 1e-6)))
    );
    const bandHeight = documentBounds.height / bandCount;
    const documentRight = documentBounds.x + documentBounds.width;

    for (let bandIndex = 0; bandIndex < bandCount; bandIndex += 1) {
      const y = documentBounds.y + bandIndex * bandHeight;
      const sampleY = y + bandHeight / 2;
      const insideIntervals = getPolygonInsideIntervals(
        points,
        sampleY,
        documentBounds.x,
        documentRight
      );

      if (selection.inverted && !selection.isDraft) {
        for (const interval of insideIntervals) {
          this.drawRectangleIfVisible({
            x: interval.left,
            y,
            width: interval.right - interval.left,
            height: bandHeight
          });
        }
        continue;
      }

      if (insideIntervals.length === 0) {
        this.drawRectangleIfVisible({
          x: documentBounds.x,
          y,
          width: documentBounds.width,
          height: bandHeight
        });
        continue;
      }

      let nextDimStart = documentBounds.x;

      for (const interval of insideIntervals) {
        this.drawRectangleIfVisible({
          x: nextDimStart,
          y,
          width: interval.left - nextDimStart,
          height: bandHeight
        });
        nextDimStart = Math.max(nextDimStart, interval.right);
      }

      this.drawRectangleIfVisible({
        x: nextDimStart,
        y,
        width: documentRight - nextDimStart,
        height: bandHeight
      });
    }
  }

  private drawRectangleOutline(rectangle: Rectangle, lineWidth: number) {
    const bottomLeft = { x: rectangle.x, y: rectangle.y };
    const bottomRight = { x: rectangle.x + rectangle.width, y: rectangle.y };
    const topRight = { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height };
    const topLeft = { x: rectangle.x, y: rectangle.y + rectangle.height };

    this.drawLine(bottomLeft, bottomRight, lineWidth);
    this.drawLine(bottomRight, topRight, lineWidth);
    this.drawLine(topRight, topLeft, lineWidth);
    this.drawLine(topLeft, bottomLeft, lineWidth);
  }

  private drawDashedRectangleOutline(
    rectangle: Rectangle,
    lineWidth: number,
    dashLength: number,
    gapLength: number,
    dashOffset: number
  ) {
    this.drawDashedPolyline(
      [
        { x: rectangle.x, y: rectangle.y },
        { x: rectangle.x + rectangle.width, y: rectangle.y },
        { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height },
        { x: rectangle.x, y: rectangle.y + rectangle.height }
      ],
      true,
      lineWidth,
      dashLength,
      gapLength,
      dashOffset
    );
  }

  private drawEllipseOutline(bounds: Rectangle, lineWidth: number) {
    const segmentCount = 64;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;
    let previous = {
      x: centerX + radiusX,
      y: centerY
    };

    for (let index = 1; index <= segmentCount; index += 1) {
      const angle = (index / segmentCount) * Math.PI * 2;
      const next = {
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY
      };

      this.drawLine(previous, next, lineWidth);
      previous = next;
    }
  }

  private drawPolylineOutline(points: Point[], closed: boolean, lineWidth: number) {
    const segmentCount = closed ? points.length : points.length - 1;

    for (let index = 0; index < segmentCount; index += 1) {
      this.drawLine(points[index], points[(index + 1) % points.length], lineWidth);
    }
  }

  private drawDashedEllipseOutline(
    bounds: Rectangle,
    lineWidth: number,
    dashLength: number,
    gapLength: number,
    dashOffset: number
  ) {
    const segmentCount = 128;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;
    const points: Point[] = [];

    for (let index = 0; index < segmentCount; index += 1) {
      const angle = (index / segmentCount) * Math.PI * 2;

      points.push({
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY
      });
    }

    this.drawDashedPolyline(points, true, lineWidth, dashLength, gapLength, dashOffset);
  }

  private drawDashedPolyline(
    points: Point[],
    closed: boolean,
    lineWidth: number,
    dashLength: number,
    gapLength: number,
    dashOffset: number
  ) {
    const period = dashLength + gapLength;
    const segmentCount = closed ? points.length : points.length - 1;
    let pathDistance = -dashOffset;

    for (let index = 0; index < segmentCount; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const segmentLength = distance(start, end);
      let segmentDistance = 0;

      if (segmentLength <= 0) {
        continue;
      }

      while (segmentDistance < segmentLength) {
        const phase = positiveModulo(pathDistance + segmentDistance, period);
        const distanceToNextDash = phase < dashLength ? 0 : period - phase;
        const dashStart = Math.min(segmentLength, segmentDistance + distanceToNextDash);
        const dashPhase = positiveModulo(pathDistance + dashStart, period);
        const dashEnd = Math.min(segmentLength, dashStart + dashLength - dashPhase);

        if (dashEnd > dashStart) {
          this.drawLine(
            interpolatePoint(start, end, dashStart / segmentLength),
            interpolatePoint(start, end, dashEnd / segmentLength),
            lineWidth
          );
        }

        segmentDistance = Math.max(dashEnd, dashStart + 0.0001);
      }

      pathDistance += segmentLength;
    }
  }

  private drawRectangle(rectangle: Rectangle) {
    this.solidColorShaderProgram.setModel(getModelMatrix(rectangle));
    this.solidColorShaderProgram.setMaskEnabled(false);
    this.solidColorShaderProgram.setMaskTextureUnit(1);
    this.quad.drawTextured(this.solidColorShaderProgram);
  }

  private drawMaskedRectangle(
    rectangle: Rectangle,
    maskTexture: WebGLTexture,
    invertMask: boolean
  ) {
    this.solidColorShaderProgram.setModel(getModelMatrix(rectangle));
    this.solidColorShaderProgram.setMaskTextureUnit(1);
    this.solidColorShaderProgram.setMaskEnabled(true);
    this.solidColorShaderProgram.setMaskInverted(invertMask);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, maskTexture);
    this.quad.drawTextured(this.solidColorShaderProgram);
    this.solidColorShaderProgram.setMaskEnabled(false);
  }

  private drawRectangleIfVisible(rectangle: Rectangle) {
    if (rectangle.width <= 0 || rectangle.height <= 0) {
      return;
    }

    this.drawRectangle(rectangle);
  }

  private drawLine(start: Point, end: Point, width: number) {
    const center = midpoint(start, end);
    const length = distance(start, end);
    const rotation = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;

    this.drawRectangle({
      x: center.x - length / 2,
      y: center.y - width / 2,
      width: length,
      height: width,
      rotation
    });
  }

  private drawMaskOutline(
    selection: SelectionSnapshot,
    lineWidth: number,
    accentOnly = false
  ) {
    if (!selection.mask) {
      return;
    }

    const segments = this.getMaskEdgeSegments(selection.mask, selection.bounds);

    if (segments.length === 0) {
      this.drawRectangleOutline(selection.bounds, lineWidth);
      return;
    }

    for (let index = 0; index < segments.length; index += 1) {
      if (accentOnly && index % 2 !== 0) {
        continue;
      }

      const segment = segments[index];

      this.drawLine(segment.start, segment.end, lineWidth);
    }
  }

  private getMaskTexture(mask: SelectionMask) {
    const cachedTexture = this.maskTextureCache.get(mask);

    if (cachedTexture) {
      return cachedTexture;
    }

    const texture = this.gl.createTexture();

    if (!texture) {
      throw new Error("Unable to create selection mask texture.");
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 1);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.LUMINANCE,
      mask.width,
      mask.height,
      0,
      this.gl.LUMINANCE,
      this.gl.UNSIGNED_BYTE,
      mask.data
    );

    this.maskTextureCache.set(mask, texture);
    this.maskTextures.add(texture);

    return texture;
  }

  private getMaskEdgeSegments(mask: SelectionMask, bounds: Rectangle) {
    const cached = this.maskEdgeCache.get(mask);

    if (cached && cached.width === mask.width && cached.height === mask.height) {
      return cached.segments;
    }

    const segments = buildMaskEdgeSegments(mask, bounds);

    this.maskEdgeCache.set(mask, {
      height: mask.height,
      segments,
      width: mask.width
    });

    return segments;
  }

}

function clampRectangleToBounds(rectangle: Rectangle, bounds: Rectangle) {
  const x = Math.max(rectangle.x, bounds.x);
  const y = Math.max(rectangle.y, bounds.y);
  const right = Math.min(rectangle.x + rectangle.width, bounds.x + bounds.width);
  const top = Math.min(rectangle.y + rectangle.height, bounds.y + bounds.height);

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, top - y)
  };
}

function interpolatePoint(start: Point, end: Point, amount: number) {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount
  };
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function getPolygonInsideIntervals(
  points: Point[],
  y: number,
  clipLeft: number,
  clipRight: number
) {
  const intersections: number[] = [];

  for (let index = 0, previousIndex = points.length - 1; index < points.length; previousIndex = index++) {
    const current = points[index];
    const previous = points[previousIndex];
    const currentAbove = current.y > y;
    const previousAbove = previous.y > y;

    if (currentAbove === previousAbove) {
      continue;
    }

    const deltaY = previous.y - current.y;

    intersections.push(
      ((previous.x - current.x) * (y - current.y)) /
        (Math.abs(deltaY) > 1e-9 ? deltaY : 1e-9) +
        current.x
    );
  }

  intersections.sort((left, right) => left - right);

  const intervals: Array<{ left: number; right: number }> = [];

  for (let index = 0; index + 1 < intersections.length; index += 2) {
    const left = Math.max(clipLeft, intersections[index]);
    const right = Math.min(clipRight, intersections[index + 1]);

    if (right > left) {
      intervals.push({ left, right });
    }
  }

  return intervals;
}

function buildMaskEdgeSegments(mask: SelectionMask, bounds: Rectangle) {
  const maxSegmentCount = 2400;
  let stride = Math.max(1, Math.ceil(Math.sqrt((mask.width * mask.height) / 90_000)));

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const segments = collectMaskEdgeSegments(mask, bounds, stride);

    if (segments.length <= maxSegmentCount) {
      return segments;
    }

    stride *= 2;
  }

  return collectMaskEdgeSegments(mask, bounds, stride).slice(0, maxSegmentCount);
}

function collectMaskEdgeSegments(
  mask: SelectionMask,
  bounds: Rectangle,
  stride: number
): MaskEdgeSegment[] {
  const segments: MaskEdgeSegment[] = [];

  for (let y = 0; y < mask.height; y += stride) {
    for (let x = 0; x < mask.width; x += stride) {
      if (!isMaskCellSelected(mask, x, y)) {
        continue;
      }

      const left = x;
      const right = Math.min(mask.width, x + stride);
      const bottom = y;
      const top = Math.min(mask.height, y + stride);

      if (!isMaskCellSelected(mask, x - stride, y)) {
        segments.push({
          end: maskPointToWorld(bounds, left, top, mask.width, mask.height),
          start: maskPointToWorld(bounds, left, bottom, mask.width, mask.height)
        });
      }

      if (!isMaskCellSelected(mask, x + stride, y)) {
        segments.push({
          end: maskPointToWorld(bounds, right, top, mask.width, mask.height),
          start: maskPointToWorld(bounds, right, bottom, mask.width, mask.height)
        });
      }

      if (!isMaskCellSelected(mask, x, y - stride)) {
        segments.push({
          end: maskPointToWorld(bounds, right, bottom, mask.width, mask.height),
          start: maskPointToWorld(bounds, left, bottom, mask.width, mask.height)
        });
      }

      if (!isMaskCellSelected(mask, x, y + stride)) {
        segments.push({
          end: maskPointToWorld(bounds, right, top, mask.width, mask.height),
          start: maskPointToWorld(bounds, left, top, mask.width, mask.height)
        });
      }
    }
  }

  return segments;
}

function isMaskCellSelected(mask: SelectionMask, x: number, y: number) {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) {
    return false;
  }

  return mask.data[y * mask.width + x] > 127;
}

function maskPointToWorld(
  bounds: Rectangle,
  x: number,
  y: number,
  maskWidth: number,
  maskHeight: number
): Point {
  return {
    x: bounds.x + (x / Math.max(1, maskWidth)) * bounds.width,
    y: bounds.y + (y / Math.max(1, maskHeight)) * bounds.height
  };
}
