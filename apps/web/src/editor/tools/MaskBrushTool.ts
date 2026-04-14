import { Camera2D } from "../core/Camera2D";
import { Scene } from "../core/Scene";
import { Layer } from "../layers/Layer";
import { LayerMask } from "../layers/LayerMask";
import type { ToolPointerEvent } from "./MoveTool";

export type MaskBrushMode = "hide" | "reveal";

export type MaskBrushOptions = {
  mode: MaskBrushMode;
  opacity: number;
  size: number;
};

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
  private lastPaintPoint: Point | null = null;

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

    this.isPainting = true;
    this.lastPaintPoint = null;
    this.strokeSnapshot = {
      data: new Uint8Array(layer.mask.data),
      layerId: layer.id,
      mask: layer.mask
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

    const brushRadius = this.getBrushRadiusInMaskSpace(layer, layer.mask);
    const step = Math.max(0.5, brushRadius / 6);

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

  const bounds = this.canvas.getBoundingClientRect();
  const screenX = clientX - bounds.left;
  const screenY = clientY - bounds.top;
  const worldPoint = this.camera.screenToWorld(screenX, screenY);

  const model = this.getLayerModelMatrix(layer);
  const inverse = invert3x3(model);

  if (!inverse) {
    return null;
  }

  const local = transformPoint3x3(inverse, worldPoint.x, worldPoint.y);

  const radius = this.getBrushRadiusInMaskSpace(layer, layer.mask);
  const radiusX = radius / Math.max(1, layer.mask.width - 1);
  const radiusY = radius / Math.max(1, layer.mask.height - 1);

  if (
    local.x < -radiusX ||
    local.x > 1 + radiusX ||
    local.y < -radiusY ||
    local.y > 1 + radiusY
  ) {
    return null;
  }

  return {
    x: local.x * (layer.mask.width - 1) + 0.5,
    y: (1 - local.y) * (layer.mask.height - 1) + 0.5
  };
}

  private getLayerModelMatrix(layer: Layer) {
    const width = layer.width * layer.scaleX;
    const height = layer.height * layer.scaleY;
    const radians = (layer.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const centerX = layer.x + width / 2;
    const centerY = layer.y + height / 2;
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

  private getBrushRadiusInMaskSpace(layer: Layer, mask: LayerMask) {
    const zoom = this.getCameraZoom();

    const renderedWidth = layer.width * Math.abs(layer.scaleX);
    const renderedHeight = layer.height * Math.abs(layer.scaleY);

    const maskPixelsPerWorldX = mask.width / Math.max(1e-6, renderedWidth);
    const maskPixelsPerWorldY = mask.height / Math.max(1e-6, renderedHeight);

    const brushSizeInScreenPixels = this.brushOptions.size;
    const brushSizeInWorld = brushSizeInScreenPixels / zoom;

    const brushSizeInMask =
      ((brushSizeInWorld * maskPixelsPerWorldX) +
        (brushSizeInWorld * maskPixelsPerWorldY)) / 2;

    return Math.max(0.5, brushSizeInMask / 2);
  }

  private getCameraZoom() {
    return this.camera.zoom > 0 ? this.camera.zoom : 1;
  }

  private paintMaskCircle(layer: Layer, mask: LayerMask, point: Point) {
    const radius = this.getBrushRadiusInMaskSpace(layer, mask);
    const minX = Math.max(0, Math.floor(point.x - radius));
    const maxX = Math.min(mask.width - 1, Math.ceil(point.x + radius));
    const minY = Math.max(0, Math.floor(point.y - radius));
    const maxY = Math.min(mask.height - 1, Math.ceil(point.y + radius));
    const target = this.brushOptions.mode === "reveal" ? 255 : 0;
    const opacity = clamp(this.brushOptions.opacity, 0, 1);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x + 0.5 - point.x;
        const dy = y + 0.5 - point.y;
        const distance = Math.hypot(dx, dy);

        if (distance > radius) {
          continue;
        }

        const edgeSoftness = Math.max(1, radius * 0.18);
        const falloff = clamp((radius - distance) / edgeSoftness, 0, 1);
        const amount = opacity * falloff;
        const pixelIndex = y * mask.width + x;
        const current = mask.data[pixelIndex];

        mask.data[pixelIndex] = Math.round(current + (target - current) * amount);
      }
    }
  }
}

type Point = {
  x: number;
  y: number;
};

function transformPoint3x3(matrix: Float32Array, x: number, y: number) {
  return {
    x: matrix[0] * x + matrix[3] * y + matrix[6],
    y: matrix[1] * x + matrix[4] * y + matrix[7]
  };
}

function invert3x3(matrix: Float32Array) {
  const a = matrix[0];
  const b = matrix[1];
  const c = matrix[2];
  const d = matrix[3];
  const e = matrix[4];
  const f = matrix[5];
  const g = matrix[6];
  const h = matrix[7];
  const i = matrix[8];

  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + d * D + g * G;

  if (Math.abs(det) < 1e-8) {
    return null;
  }

  const invDet = 1 / det;

  return new Float32Array([
    A * invDet,
    D * invDet,
    G * invDet,
    B * invDet,
    E * invDet,
    H * invDet,
    C * invDet,
    F * invDet,
    I * invDet
  ]);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}