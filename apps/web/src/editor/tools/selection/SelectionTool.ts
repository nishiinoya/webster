/** Rectangle, ellipse, lasso, and magic selection tool implementation. */
import { invert3x3, transformPoint3x3 } from "../../geometry/Matrix3";
import { Camera2D } from "../../geometry/Camera2D";
import { getLayerCorners, getModelMatrix } from "../../geometry/TransformGeometry";
import { ImageLayer } from "../../layers/ImageLayer";
import { Scene } from "../../scene/Scene";
import type {
  SelectionMode,
  SelectionPoint,
  SelectionShape
} from "../../selection/SelectionManager";
import type { ToolPointerEvent } from "../move/MoveTool";

type DragStart = {
  x: number;
  y: number;
};

export class SelectionTool {
  private dragStart: DragStart | null = null;
  private instantSelectionPending = false;
  private lassoPoints: SelectionPoint[] = [];
  private mode: SelectionMode = "replace";
  private shape: SelectionShape = "rectangle";
  private dragMode: SelectionMode = "replace";
  private magicTolerance = 12;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private scene: Scene,
    private readonly camera: Camera2D
  ) {}

  setScene(scene: Scene) {
    this.cancel();
    this.scene = scene;
  }

  setShape(shape: SelectionShape) {
    this.cancel();
    this.shape = shape;
  }

  setMode(mode: SelectionMode) {
    this.mode = mode;
  }

  setMagicTolerance(tolerance: number) {
    this.magicTolerance = Math.min(Math.max(Math.round(tolerance), 0), 100);
  }

  pointerDown(event: ToolPointerEvent) {
    if (event.button !== 0) {
      return false;
    }

    const point = this.clientToWorld(event.clientX, event.clientY);
    const mode = getSelectionModeForEvent(event, this.mode);

    if (this.shape === "mask") {
      this.instantSelectionPending = this.commitMagicSelection(point, mode);
      return this.instantSelectionPending;
    }

    this.dragMode = mode;
    this.dragStart = point;

    if (this.shape === "lasso") {
      this.lassoPoints = [point];
      this.scene.selection.setDraft("lasso", getPointBounds(this.lassoPoints), this.lassoPoints);
      return true;
    }

    this.scene.selection.setDraft(this.shape, {
      height: 0,
      width: 0,
      x: point.x,
      y: point.y
    });

    return true;
  }

  pointerMove(event: ToolPointerEvent) {
    if (!this.dragStart) {
      return false;
    }

    const point = this.clientToWorld(event.clientX, event.clientY);

    if (this.shape === "lasso") {
      const previousPoint = this.lassoPoints.at(-1);
      const minDistance = 1 / Math.max(this.camera.zoom, 1e-6);

      if (!previousPoint || Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) >= minDistance) {
        this.lassoPoints.push(point);
      }

      this.scene.selection.setDraft("lasso", getPointBounds(this.lassoPoints), this.lassoPoints);
      return true;
    }

    this.scene.selection.setDraft(this.shape, {
      height: point.y - this.dragStart.y,
      width: point.x - this.dragStart.x,
      x: this.dragStart.x,
      y: this.dragStart.y
    });

    return true;
  }

  pointerUp() {
    if (this.instantSelectionPending) {
      this.instantSelectionPending = false;
      return true;
    }

    const didDrag = Boolean(this.dragStart);

    if (didDrag && this.shape === "lasso") {
      this.scene.selection.commitLasso(
        this.lassoPoints,
        2 / Math.max(this.camera.zoom, 1e-6),
        this.dragMode
      );
    } else if (didDrag) {
      this.scene.selection.commitDraft(2 / Math.max(this.camera.zoom, 1e-6), this.dragMode);
    }

    this.cancel();
    return didDrag;
  }

  cancel() {
    this.dragStart = null;
    this.instantSelectionPending = false;
    this.lassoPoints = [];
    this.scene.selection.cancelDraft();
  }

  getCursor() {
    return "crosshair" as const;
  }

  private commitMagicSelection(point: SelectionPoint, mode: SelectionMode) {
    const layer = this.getMagicImageLayer(point);

    if (!layer) {
      return false;
    }

    const inverseMatrix = invert3x3(getModelMatrix(layer));

    if (!inverseMatrix) {
      return false;
    }

    const localPoint = transformPoint3x3(inverseMatrix, point.x, point.y);

    if (localPoint.x < 0 || localPoint.x > 1 || localPoint.y < 0 || localPoint.y > 1) {
      return false;
    }

    const source = createImagePixelCanvas(layer.image);
    const sourceImageData = source.context.getImageData(0, 0, source.width, source.height);
    const sourceX = Math.min(source.width - 1, Math.max(0, Math.floor(localPoint.x * source.width)));
    const sourceY = Math.min(source.height - 1, Math.max(0, Math.floor((1 - localPoint.y) * source.height)));
    const selectedSourcePixels = cleanMagicSelectionMask(floodFillSimilarPixels(
      sourceImageData.data,
      source.width,
      source.height,
      sourceX,
      sourceY,
      this.magicTolerance
    ), source.width, source.height);

    if (!selectedSourcePixels.some(Boolean)) {
      return false;
    }

    const bounds = getLayerWorldBounds(layer);
    const size = getMagicSelectionMaskSize(bounds);
    const data = new Uint8Array(size.width * size.height);

    for (let y = 0; y < size.height; y += 1) {
      const worldY = bounds.y + ((y + 0.5) / size.height) * bounds.height;

      for (let x = 0; x < size.width; x += 1) {
        const worldX = bounds.x + ((x + 0.5) / size.width) * bounds.width;
        const sourcePoint = transformPoint3x3(inverseMatrix, worldX, worldY);

        if (
          sourcePoint.x < 0 ||
          sourcePoint.x > 1 ||
          sourcePoint.y < 0 ||
          sourcePoint.y > 1
        ) {
          continue;
        }

        const mappedX = Math.min(
          source.width - 1,
          Math.max(0, Math.floor(sourcePoint.x * source.width))
        );
        const mappedY = Math.min(
          source.height - 1,
          Math.max(0, Math.floor((1 - sourcePoint.y) * source.height))
        );

        data[y * size.width + x] = selectedSourcePixels[mappedY * source.width + mappedX] ? 255 : 0;
      }
    }

    if (!data.some(Boolean)) {
      return false;
    }

    return Boolean(this.scene.selection.commitMask(bounds, size.width, size.height, data, mode));
  }

  private getMagicImageLayer(point: SelectionPoint) {
    const selectedLayer =
      this.scene.selectedLayerIds.length === 1 && this.scene.selectedLayerId
        ? this.scene.getLayer(this.scene.selectedLayerId)
        : null;

    if (
      selectedLayer instanceof ImageLayer &&
      !selectedLayer.locked &&
      isWorldPointInsideImageLayer(selectedLayer, point)
    ) {
      return selectedLayer;
    }

    const hitLayer = this.scene.hitTestLayer(point.x, point.y);

    return hitLayer instanceof ImageLayer && !hitLayer.locked ? hitLayer : null;
  }

  private clientToWorld(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();

    return this.camera.screenToWorld(clientX - bounds.left, clientY - bounds.top);
  }
}

function isWorldPointInsideImageLayer(layer: ImageLayer, point: SelectionPoint) {
  const inverseMatrix = invert3x3(getModelMatrix(layer));

  if (!inverseMatrix) {
    return false;
  }

  const localPoint = transformPoint3x3(inverseMatrix, point.x, point.y);

  return localPoint.x >= 0 && localPoint.x <= 1 && localPoint.y >= 0 && localPoint.y <= 1;
}

function getSelectionModeForEvent(event: ToolPointerEvent, fallback: SelectionMode): SelectionMode {
  if (event.shiftKey && event.altKey) {
    return "intersect";
  }

  if (event.altKey) {
    return "subtract";
  }

  if (event.shiftKey) {
    return "add";
  }

  return fallback;
}

function createImagePixelCanvas(image: HTMLImageElement) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context || width <= 0 || height <= 0) {
    throw new Error("Unable to read image pixels.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return {
    canvas,
    context,
    height,
    width
  };
}

function floodFillSimilarPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance: number
) {
  const selected = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const stack = [startY * width + startX];
  const startIndex = (startY * width + startX) * 4;
  const minimumAlpha = 12;
  const target = getMagicPixelMetrics(data, startIndex);

  if (target.alpha < minimumAlpha) {
    return selected;
  }

  const thresholds = getMagicThresholds(tolerance);

  while (stack.length > 0) {
    const pixelIndex = stack.pop() ?? 0;

    if (visited[pixelIndex]) {
      continue;
    }

    visited[pixelIndex] = 1;

    if (!isSimilarPixel(data, pixelIndex * 4, target, thresholds, minimumAlpha)) {
      continue;
    }

    selected[pixelIndex] = 1;

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    if (x > 0) {
      stack.push(pixelIndex - 1);
    }

    if (x + 1 < width) {
      stack.push(pixelIndex + 1);
    }

    if (y > 0) {
      stack.push(pixelIndex - width);
    }

    if (y + 1 < height) {
      stack.push(pixelIndex + width);
    }
  }

  return selected;
}

function isSimilarPixel(
  data: Uint8ClampedArray,
  index: number,
  target: MagicPixelMetrics,
  thresholds: MagicThresholds,
  minimumAlpha: number
) {
  if (data[index + 3] < minimumAlpha) {
    return false;
  }

  const pixel = getMagicPixelMetrics(data, index);
  const redDiff = Math.abs(pixel.red - target.red);
  const greenDiff = Math.abs(pixel.green - target.green);
  const blueDiff = Math.abs(pixel.blue - target.blue);
  const maxChannelDiff = Math.max(redDiff, greenDiff, blueDiff);
  const lumaDiff = Math.abs(pixel.luma - target.luma);
  const redChromaDiff = pixel.redChroma - target.redChroma;
  const blueChromaDiff = pixel.blueChroma - target.blueChroma;
  const alphaDiff = Math.abs(pixel.alpha - target.alpha);

  if (
    maxChannelDiff > thresholds.maxChannel ||
    lumaDiff > thresholds.luma ||
    alphaDiff > thresholds.alpha
  ) {
    return false;
  }

  return (
    redChromaDiff * redChromaDiff +
      blueChromaDiff * blueChromaDiff <=
    thresholds.chromaSquared
  );
}

type MagicPixelMetrics = {
  alpha: number;
  blue: number;
  blueChroma: number;
  green: number;
  luma: number;
  red: number;
  redChroma: number;
};

type MagicThresholds = {
  alpha: number;
  chromaSquared: number;
  luma: number;
  maxChannel: number;
};

function getMagicPixelMetrics(data: Uint8ClampedArray, index: number): MagicPixelMetrics {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const alpha = data[index + 3];
  const luma = red * 0.299 + green * 0.587 + blue * 0.114;

  return {
    alpha,
    blue,
    blueChroma: blue - luma,
    green,
    luma,
    red,
    redChroma: red - luma
  };
}

function getMagicThresholds(tolerance: number): MagicThresholds {
  const value = Math.max(0, tolerance);
  const chroma = Math.max(2, value * 0.72 + 2);

  return {
    alpha: Math.max(10, value * 1.25 + 4),
    chromaSquared: chroma * chroma,
    luma: Math.max(2, value * 0.72 + 2),
    maxChannel: Math.max(3, value * 0.95 + 3)
  };
}

function cleanMagicSelectionMask(selection: Uint8Array, width: number, height: number) {
  const output = new Uint8Array(selection);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const selectedNeighborCount = countSelectedNeighbors(selection, width, height, x, y);

      if (selection[index] && selectedNeighborCount <= 1) {
        output[index] = 0;
      } else if (!selection[index] && selectedNeighborCount >= 7) {
        output[index] = 1;
      }
    }
  }

  return output;
}

function countSelectedNeighbors(
  selection: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
) {
  let count = 0;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      const sampleX = x + offsetX;
      const sampleY = y + offsetY;

      if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) {
        continue;
      }

      count += selection[sampleY * width + sampleX] ? 1 : 0;
    }
  }

  return count;
}

function getPointBounds(points: SelectionPoint[]) {
  if (points.length === 0) {
    return {
      height: 1,
      width: 1,
      x: 0,
      y: 0
    };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    height: Math.max(1, maxY - minY),
    width: Math.max(1, maxX - minX),
    x: minX,
    y: minY
  };
}

function getLayerWorldBounds(layer: ImageLayer) {
  const corners = getLayerCorners(layer);
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    height: Math.max(1, maxY - minY),
    width: Math.max(1, maxX - minX),
    x: minX,
    y: minY
  };
}

function getMagicSelectionMaskSize(bounds: { height: number; width: number }) {
  const maxPixelArea = 1_400_000;
  const scale = Math.min(
    1,
    1600 / Math.max(1, bounds.width),
    1600 / Math.max(1, bounds.height),
    Math.sqrt(maxPixelArea / Math.max(1, bounds.width * bounds.height))
  );

  return {
    height: Math.max(1, Math.round(bounds.height * scale)),
    width: Math.max(1, Math.round(bounds.width * scale))
  };
}
