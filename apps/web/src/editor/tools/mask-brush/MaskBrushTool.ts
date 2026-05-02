/** Mask brush tool implementation and undo snapshot support. */
import { Camera2D } from "../../geometry/Camera2D";
import { invert3x3, transformPoint3x3 } from "../../geometry/Matrix3";
import { Scene } from "../../scene/Scene";
import { getModelMatrix } from "../../geometry/TransformGeometry";
import type { Point } from "../../geometry/TransformGeometry";
import { Layer } from "../../layers/Layer";
import { TextLayer } from "../../layers/TextLayer";
import { ensureLayerMaskResolution } from "../../masks/LayerMaskResolution";
import type { LayerMask } from "../../masks/LayerMask";
import type { MaskDirtyRect } from "../../masks/LayerMask";
import { getTextMaskFrame } from "../../rendering/text/BitmapText";
import { clamp, getBrushRadiiInMaskSpace, paintMaskEllipse } from "./MaskBrushRaster";
import type { MaskBrushPixelPredicate } from "./MaskBrushRaster";
import type { MaskBrushOptions } from "./MaskBrushTypes";
import type { ToolPointerEvent } from "../move/MoveTool";
import { containsSelectionPoint } from "../../selection/SelectionManager";
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
  private strokeSelectionPredicate: MaskBrushPixelPredicate | undefined;
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
    const mask = ensureLayerMaskResolution(layer);

    this.isPainting = true;
    this.lastPaintPoint = null;
    this.strokeSnapshot = {
      data: new Uint8Array(mask.data),
      layerId: layer.id,
      mask
    };
    this.strokeSelectionPredicate = this.createSelectionPixelPredicate(layer, mask);

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
    this.strokeSelectionPredicate = undefined;
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
    snapshot.mask.markDirty();
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
    const step = Math.max(1, Math.min(brushRadii.x, brushRadii.y) / 4);
    let dirtyRect: MaskDirtyRect | null = null;

    if (this.lastPaintPoint) {
      const distance = Math.hypot(point.x - this.lastPaintPoint.x, point.y - this.lastPaintPoint.y);
      const steps = Math.max(1, Math.ceil(distance / step));

      for (let index = 1; index <= steps; index += 1) {
        const amount = index / steps;

        dirtyRect = unionDirtyRects(
          dirtyRect,
          this.paintMaskCircle(layer, layer.mask, {
            x: this.lastPaintPoint.x + (point.x - this.lastPaintPoint.x) * amount,
            y: this.lastPaintPoint.y + (point.y - this.lastPaintPoint.y) * amount
          })
        );
      }
    } else {
      dirtyRect = this.paintMaskCircle(layer, layer.mask, point);
    }

    this.lastPaintPoint = point;
    if (dirtyRect) {
      layer.mask.markDirty(dirtyRect);
    }
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

    if (layer instanceof TextLayer) {
      return this.clientToTextLayerMaskPoint(layer, localPoint);
    }

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
    if (layer instanceof TextLayer) {
      const frame = getCurrentTextMaskFrame(layer);
      const maskPixelsPerWorldX = mask.width / Math.max(1e-6, frame.width);
      const maskPixelsPerWorldY = mask.height / Math.max(1e-6, frame.height);
      const brushRadiusInWorld = this.brushOptions.size / Math.max(1e-6, this.getCameraZoom()) / 2;

      return {
        x: Math.max(0.5, brushRadiusInWorld * maskPixelsPerWorldX),
        y: Math.max(0.5, brushRadiusInWorld * maskPixelsPerWorldY)
      };
    }

    return getBrushRadiiInMaskSpace(
      layer,
      mask,
      this.brushOptions.size,
      this.getCameraZoom()
    );
  }

  private clientToTextLayerMaskPoint(layer: TextLayer, unitPoint: Point) {
    if (!layer.mask) {
      return null;
    }

    const frame = getCurrentTextMaskFrame(layer);
    const localX = unitPoint.x * layer.width;
    const localY = unitPoint.y * layer.height;
    const normalizedX = (localX - frame.x) / frame.width;
    const normalizedY = (localY - frame.y) / frame.height;
    const radius = this.getBrushRadiiInMaskSpace(layer, layer.mask);
    const margin = {
      x: radius.x / Math.max(1, layer.mask.width - 1),
      y: radius.y / Math.max(1, layer.mask.height - 1)
    };

    if (
      normalizedX < -margin.x ||
      normalizedX > 1 + margin.x ||
      normalizedY < -margin.y ||
      normalizedY > 1 + margin.y
    ) {
      return null;
    }

    return {
      x: normalizedX * (layer.mask.width - 1) + 0.5,
      y: (1 - normalizedY) * (layer.mask.height - 1) + 0.5
    };
  }

  private getCameraZoom() {
    return this.camera.zoom > 0 ? this.camera.zoom : 1;
  }

  private paintMaskCircle(layer: Layer, mask: LayerMask, point: MaskPaintPoint) {
    const radii = this.getBrushRadiiInMaskSpace(layer, mask);
    const selectionPredicate =
      this.strokeSelectionPredicate ?? this.createSelectionPixelPredicate(layer, mask);

    return paintMaskEllipse(mask, point, radii, this.brushOptions, selectionPredicate);
  }

  private createSelectionPixelPredicate(
    layer: Layer,
    mask: LayerMask
  ): MaskBrushPixelPredicate | undefined {
    const selection = this.scene.selection.current;

    if (!selection) {
      return undefined;
    }

    if (layer instanceof TextLayer) {
      return createCachedMaskPredicate(
        mask,
        createTextSelectionPixelPredicate(layer, mask, selection)
      );
    }

    return createCachedMaskPredicate(
      mask,
      createRotatedSelectionPixelPredicate(layer, mask, selection)
    );
  }
}

type MaskPaintPoint = {
  x: number;
  y: number;
};

type MaskSelection = NonNullable<Scene["selection"]["current"]>;

function createTextSelectionPixelPredicate(
  layer: TextLayer,
  mask: LayerMask,
  selection: MaskSelection
): MaskBrushPixelPredicate {
  const frame = getCurrentTextMaskFrame(layer);
  const modelMatrix = getModelMatrix(layer);

  return (x, y) => {
    const normalizedX = (x + 0.5) / Math.max(1, mask.width);
    const normalizedYFromBottom = 1 - (y + 0.5) / Math.max(1, mask.height);
    const localX = frame.x + normalizedX * frame.width;
    const localY = frame.y + normalizedYFromBottom * frame.height;
    const worldPoint = transformPoint3x3(
      modelMatrix,
      localX / Math.max(1e-6, layer.width),
      localY / Math.max(1e-6, layer.height)
    );

    return containsSelectionPoint(selection, worldPoint.x, worldPoint.y);
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

    return containsSelectionPoint(selection, worldX, worldY);
  };
}

function createCachedMaskPredicate(
  mask: LayerMask,
  predicate: MaskBrushPixelPredicate
): MaskBrushPixelPredicate {
  const tileSize = 64;
  const tiles = new Map<number, { data: Uint8Array; width: number }>();
  const tilesPerRow = Math.ceil(mask.width / tileSize);

  return (x, y) => {
    const tileX = Math.floor(x / tileSize);
    const tileY = Math.floor(y / tileSize);
    const tileKey = tileY * tilesPerRow + tileX;
    const tileLeft = tileX * tileSize;
    const tileTop = tileY * tileSize;
    const tileWidth = Math.min(tileSize, mask.width - tileLeft);
    const tileHeight = Math.min(tileSize, mask.height - tileTop);
    const localX = x - tileLeft;
    const localY = y - tileTop;
    let tile = tiles.get(tileKey);

    if (!tile) {
      tile = {
        data: new Uint8Array(tileWidth * tileHeight),
        width: tileWidth
      };
      tiles.set(tileKey, tile);
    }

    const index = localY * tile.width + localX;
    const cached = tile.data[index];

    if (cached !== 0) {
      return cached === 2;
    }

    const result = predicate(x, y);

    tile.data[index] = result ? 2 : 1;

    return result;
  };
}

function isInsideUnitRectWithMargin(point: Point, margin: Point) {
  return (
    point.x >= -margin.x &&
    point.x <= 1 + margin.x &&
    point.y >= -margin.y &&
    point.y <= 1 + margin.y
  );
}

function getCurrentTextMaskFrame(layer: TextLayer) {
  return layer.lastTextMaskFrame ?? getTextMaskFrame(layer);
}

function unionDirtyRects(
  a: MaskDirtyRect | null,
  b: MaskDirtyRect | null
): MaskDirtyRect | null {
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
