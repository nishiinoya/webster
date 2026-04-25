/** Renderer for dimmed selections and marching-ants outlines. */
import { Camera2D } from "../../geometry/Camera2D";
import { distance, getModelMatrix, midpoint } from "../../geometry/TransformGeometry";
import { defaultLayerFilters } from "../../layers/Layer";
import type { SelectionSnapshot } from "../../selection/SelectionManager";
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

export class SelectionOverlayRenderer {
  constructor(
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

    if (selection.shape === "ellipse") {
      this.drawEllipseOutline(bounds, lineWidth * 1.8);
    } else {
      this.drawRectangleOutline(bounds, lineWidth * 1.8);
    }

    this.solidColorShaderProgram.setColor(
      selection.isDraft ? [0.94, 0.78, 0.36, 1] : [0.96, 0.98, 1, 1]
    );

    if (selection.shape === "ellipse") {
      this.drawDashedEllipseOutline(bounds, lineWidth, dashLength, gapLength, dashOffset);
    } else {
      this.drawDashedRectangleOutline(bounds, lineWidth, dashLength, gapLength, dashOffset);
    }
  }

  private drawDim(
    selection: SelectionSnapshot,
    documentBounds: { height: number; width: number; x: number; y: number },
    camera: Camera2D
  ) {
    this.solidColorShaderProgram.setColor(
      selection.isDraft ? [0.02, 0.025, 0.03, 0.18] : [0.02, 0.025, 0.03, 0.34]
    );

    if (selection.shape === "ellipse") {
      this.drawEllipseDim(selection, documentBounds, camera);
      return;
    }

    if (selection.inverted && !selection.isDraft) {
      this.drawRectangle(clampRectangleToBounds(selection.bounds, documentBounds));
      return;
    }

    this.drawRectangleDim(selection.bounds, documentBounds);
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
