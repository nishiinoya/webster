import { Camera2D } from "../../geometry/Camera2D";
import { invert3x3, transformPoint3x3 } from "../../geometry/Matrix3";
import { Scene } from "../../scene/Scene";
import { getModelMatrix } from "../../geometry/TransformGeometry";
import type { Point } from "../../geometry/TransformGeometry";
import { Layer } from "../../layers/Layer";
import { LayerMask } from "../../masks/LayerMask";
import { clamp, getBrushRadiiInMaskSpace, paintMaskEllipse } from "./MaskBrushRaster";
import type { MaskBrushPixelPredicate } from "./MaskBrushRaster";
import type { MaskBrushOptions } from "./MaskBrushTypes";
import type { ToolPointerEvent } from "../move/MoveTool";
export type { MaskBrushMode, MaskBrushOptions } from "./MaskBrushTypes";

type StrokeSnapshot = {
  data: Uint8Array;
  layerId: string;
  mask: LayerMask;
};

export class MaskBrushTool {
  private brushOptions: MaskBrushOptions = {
    mode: "reveal",
    opacity: 1,
    size: 48
  };
  private lastStrokeSnapshot: StrokeSnapshot | null = null;
  private strokeSnapshot: StrokeSnapshot | null = null;
  private isPainting = false;
  private lastPaintPoint: MaskPaintPoint | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private scene: Scene,
    private readonly camera: Camera2D
  ) {}

  setScene(scene: Scene) {
    this.cancel();
    this.scene = scene;
  }

  setOptions(options: Partial<MaskBrushOptions>) {
    this.brushOptions = {
      mode: options.mode ?? this.brushOptions.mode,
      opacity: clamp(options.opacity ?? this.brushOptions.opacity, 0, 1),
      size: Math.max(1, options.size ?? this.brushOptions.size)
    };
  }

  pointerDown(event: ToolPointerEvent) {
    if (event.button !== 0) {
      return false;
    }

    const layer = this.getSelectedLayer();

    if (!layer || layer.locked) {
      return false;
    }

    if (!layer.mask) {
      layer.mask = new LayerMask({
        height: layer.height,
        width: layer.width
      });
    }

    const mask = layer.mask;

    this.isPainting = true;
    this.lastPaintPoint = null;
    this.strokeSnapshot = {
      data: new Uint8Array(mask.data),
      layerId: layer.id,
      mask
    };

    this.paintAtEvent(event);
    return true;
  }

  pointerMove(event: ToolPointerEvent) {
    if (!this.isPainting) {
      return false;
    }

    this.paintAtEvent(event);
    return true;
  }

  pointerUp() {
    const didPaint = this.isPainting;

    if (didPaint && this.strokeSnapshot) {
      this.lastStrokeSnapshot = this.strokeSnapshot;
    }

    this.cancel();
    return didPaint;
  }

  cancel() {
    this.isPainting = false;
    this.lastPaintPoint = null;
    this.strokeSnapshot = null;
  }

  undoLastStroke() {
    const snapshot = this.lastStrokeSnapshot;

    if (!snapshot) {
      return false;
    }

    const layer = this.scene.getLayer(snapshot.layerId);

    if (!layer || layer.mask !== snapshot.mask) {
      this.lastStrokeSnapshot = null;
      return false;
    }

    snapshot.mask.data.set(snapshot.data);
    snapshot.mask.revision += 1;
    this.lastStrokeSnapshot = null;

    return true;
  }

  getCursor() {
    return `mask-brush-${Math.round(this.brushOptions.size)}-${this.brushOptions.mode}` as const;
  }

  private getSelectedLayer() {
    return this.scene.selectedLayerId ? this.scene.getLayer(this.scene.selectedLayerId) : null;
  }

  private paintAtEvent(event: ToolPointerEvent) {
    const layer = this.getSelectedLayer();

    if (!layer?.mask) {
      return;
    }

    const point = this.clientToLayerMaskPoint(layer, event.clientX, event.clientY);

    if (!point) {
      return;
    }

    const brushRadii = this.getBrushRadiiInMaskSpace(layer, layer.mask);
    const step = Math.max(0.5, Math.min(brushRadii.x, brushRadii.y) / 6);

    if (this.lastPaintPoint) {
      const distance = Math.hypot(point.x - this.lastPaintPoint.x, point.y - this.lastPaintPoint.y);
      const steps = Math.max(1, Math.ceil(distance / step));

      for (let index = 1; index <= steps; index += 1) {
        const amount = index / steps;

        this.paintMaskCircle(layer, layer.mask, {
          x: this.lastPaintPoint.x + (point.x - this.lastPaintPoint.x) * amount,
          y: this.lastPaintPoint.y + (point.y - this.lastPaintPoint.y) * amount
        });
      }
    } else {
      this.paintMaskCircle(layer, layer.mask, point);
    }

    this.lastPaintPoint = point;
    layer.mask.revision += 1;
  }

  private clientToLayerMaskPoint(layer: Layer, clientX: number, clientY: number) {
    if (!layer.mask) {
      return null;
    }

    const worldPoint = this.clientToWorld(clientX, clientY);
    const inverseModel = invert3x3(getModelMatrix(layer));

    if (!inverseModel) {
      return null;
    }

    const localPoint = transformPoint3x3(inverseModel, worldPoint.x, worldPoint.y);
    const paintMargin = this.getPaintMarginInLayerSpace(layer, layer.mask);

    if (!isInsideUnitRectWithMargin(localPoint, paintMargin)) {
      return null;
    }

    return {
      x: localPoint.x * (layer.mask.width - 1) + 0.5,
      y: (1 - localPoint.y) * (layer.mask.height - 1) + 0.5
    };
  }

  private clientToWorld(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();

    return this.camera.screenToWorld(clientX - bounds.left, clientY - bounds.top);
  }

  private getPaintMarginInLayerSpace(layer: Layer, mask: LayerMask) {
    const radius = this.getBrushRadiiInMaskSpace(layer, mask);

    return {
      x: radius.x / Math.max(1, mask.width - 1),
      y: radius.y / Math.max(1, mask.height - 1)
    };
  }

  private getBrushRadiiInMaskSpace(layer: Layer, mask: LayerMask) {
    return getBrushRadiiInMaskSpace(
      layer,
      mask,
      this.brushOptions.size,
      this.getCameraZoom()
    );
  }

  private getCameraZoom() {
    return this.camera.zoom > 0 ? this.camera.zoom : 1;
  }

  private paintMaskCircle(layer: Layer, mask: LayerMask, point: MaskPaintPoint) {
    const radii = this.getBrushRadiiInMaskSpace(layer, mask);
    const selectionPredicate = this.createSelectionPixelPredicate(layer, mask);

    paintMaskEllipse(mask, point, radii, this.brushOptions, selectionPredicate);
  }

  private createSelectionPixelPredicate(
    layer: Layer,
    mask: LayerMask
  ): MaskBrushPixelPredicate | undefined {
    const selection = this.scene.selection.current;

    if (!selection) {
      return undefined;
    }

    if (layer.rotation === 0) {
      return createUnrotatedSelectionPixelPredicate(layer, mask, selection);
    }

    return createRotatedSelectionPixelPredicate(layer, mask, selection);
  }
}

type MaskPaintPoint = {
  x: number;
  y: number;
};

type MaskSelection = NonNullable<Scene["selection"]["current"]>;

function createUnrotatedSelectionPixelPredicate(
  layer: Layer,
  mask: LayerMask,
  selection: MaskSelection
): MaskBrushPixelPredicate {
  const layerWidth = layer.width * layer.scaleX;
  const layerHeight = layer.height * layer.scaleY;
  const selectionMinX =
    ((selection.bounds.x - layer.x) / Math.max(1e-6, layerWidth)) * mask.width;
  const selectionMaxX =
    ((selection.bounds.x + selection.bounds.width - layer.x) / Math.max(1e-6, layerWidth)) *
    mask.width;
  const selectionTopY =
    (1 - (selection.bounds.y + selection.bounds.height - layer.y) / Math.max(1e-6, layerHeight)) *
    mask.height;
  const selectionBottomY =
    (1 - (selection.bounds.y - layer.y) / Math.max(1e-6, layerHeight)) * mask.height;
  const minX = Math.min(selectionMinX, selectionMaxX);
  const maxX = Math.max(selectionMinX, selectionMaxX);
  const minY = Math.min(selectionTopY, selectionBottomY);
  const maxY = Math.max(selectionTopY, selectionBottomY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const radiusX = Math.max(1e-6, Math.abs(maxX - minX) / 2);
  const radiusY = Math.max(1e-6, Math.abs(maxY - minY) / 2);

  return (x, y) => {
    const pixelX = x + 0.5;
    const pixelY = y + 0.5;
    const insideBounds =
      pixelX >= minX && pixelX <= maxX && pixelY >= minY && pixelY <= maxY;
    let isInside = insideBounds;

    if (insideBounds && selection.shape === "ellipse") {
      const normalizedX = (pixelX - centerX) / radiusX;
      const normalizedY = (pixelY - centerY) / radiusY;

      isInside = normalizedX * normalizedX + normalizedY * normalizedY <= 1;
    }

    return selection.inverted ? !isInside : isInside;
  };
}

function createRotatedSelectionPixelPredicate(
  layer: Layer,
  mask: LayerMask,
  selection: MaskSelection
): MaskBrushPixelPredicate {
  const modelMatrix = getModelMatrix(layer);
  const xScale = 1 / Math.max(1, mask.width);
  const yScale = 1 / Math.max(1, mask.height);
  const matrixXFromMaskX = modelMatrix[0] * xScale;
  const matrixXFromMaskY = -modelMatrix[3] * yScale;
  const matrixYFromMaskX = modelMatrix[1] * xScale;
  const matrixYFromMaskY = -modelMatrix[4] * yScale;
  const baseWorldX = modelMatrix[3] + modelMatrix[6] + (modelMatrix[0] * xScale) / 2 - (modelMatrix[3] * yScale) / 2;
  const baseWorldY = modelMatrix[4] + modelMatrix[7] + (modelMatrix[1] * xScale) / 2 - (modelMatrix[4] * yScale) / 2;

  return (x, y) => {
    const worldX = baseWorldX + x * matrixXFromMaskX + y * matrixXFromMaskY;
    const worldY = baseWorldY + x * matrixYFromMaskX + y * matrixYFromMaskY;

    return containsSelectionWorldPoint(selection, worldX, worldY);
  };
}

function containsSelectionWorldPoint(selection: MaskSelection, x: number, y: number) {
  const bounds = selection.bounds;
  const insideBounds =
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height;
  let isInside = insideBounds;

  if (insideBounds && selection.shape === "ellipse") {
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;
    const centerX = bounds.x + radiusX;
    const centerY = bounds.y + radiusY;
    const normalizedX = radiusX > 0 ? (x - centerX) / radiusX : 0;
    const normalizedY = radiusY > 0 ? (y - centerY) / radiusY : 0;

    isInside = normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  }

  return selection.inverted ? !isInside : isInside;
}

function isInsideUnitRectWithMargin(point: Point, margin: Point) {
  return (
    point.x >= -margin.x &&
    point.x <= 1 + margin.x &&
    point.y >= -margin.y &&
    point.y <= 1 + margin.y
  );
}
