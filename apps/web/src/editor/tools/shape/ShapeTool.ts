import { Camera2D } from "../../geometry/Camera2D";
import { ShapeLayer } from "../../layers/ShapeLayer";
import type { ShapeKind } from "../../layers/ShapeLayer";
import { Scene } from "../../scene/Scene";
import type { ToolPointerEvent } from "../move/MoveTool";

type Point = {
  x: number;
  y: number;
};

export class ShapeTool {
  private dragLayer: ShapeLayer | null = null;
  private dragStart: Point | null = null;
  private shape: ShapeKind = "rectangle";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private scene: Scene,
    private readonly camera: Camera2D
  ) {}

  setScene(scene: Scene) {
    this.cancel();
    this.scene = scene;
  }

  setShape(shape: ShapeKind) {
    this.shape = shape;
  }

  pointerDown(event: ToolPointerEvent) {
    if (event.button !== 0) {
      return false;
    }

    const point = this.clientToWorld(event.clientX, event.clientY);
    const layer = new ShapeLayer({
      id: crypto.randomUUID(),
      name: getShapeName(this.shape),
      x: point.x,
      y: point.y,
      width: 1,
      height: this.shape === "line" ? getDefaultStrokeWidth() : 1,
      shape: this.shape,
      fillColor: this.shape === "line" ? [0.18, 0.49, 0.44, 0] : [0.18, 0.49, 0.44, 1],
      strokeColor: [0.07, 0.08, 0.09, 1],
      strokeWidth: this.shape === "line" ? getDefaultStrokeWidth() : 0
    });

    this.dragStart = point;
    this.dragLayer = layer;
    this.scene.addLayer(layer);

    return true;
  }

  pointerMove(event: ToolPointerEvent) {
    if (!this.dragLayer || !this.dragStart) {
      return false;
    }

    this.updateDragLayer(this.clientToWorld(event.clientX, event.clientY), false);

    return true;
  }

  pointerUp() {
    if (!this.dragLayer || !this.dragStart) {
      return false;
    }

    const didCreate = true;

    if (
      (this.dragLayer.shape === "line" && this.dragLayer.width < 2) ||
      (this.dragLayer.shape !== "line" && this.dragLayer.width < 2 && this.dragLayer.height < 2)
    ) {
      this.applyDefaultSize();
    }

    this.dragLayer = null;
    this.dragStart = null;

    return didCreate;
  }

  cancel() {
    this.dragLayer = null;
    this.dragStart = null;
  }

  getCursor() {
    return "crosshair" as const;
  }

  private updateDragLayer(point: Point, useDefaultSize: boolean) {
    const layer = this.dragLayer;
    const start = this.dragStart;

    if (!layer || !start) {
      return;
    }

    if (layer.shape === "line") {
      const end = useDefaultSize ? { x: start.x + 180, y: start.y } : point;
      const length = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
      const rotation = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
      const strokeWidth = Math.max(1, layer.strokeWidth || getDefaultStrokeWidth());
      const center = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2
      };

      layer.x = center.x - length / 2;
      layer.y = center.y - strokeWidth / 2;
      layer.width = length;
      layer.height = strokeWidth;
      layer.rotation = normalizeRotation(rotation);
      layer.scaleX = 1;
      layer.scaleY = 1;
      return;
    }

    const end = useDefaultSize
      ? {
          x: start.x + (layer.shape === "circle" ? 140 : 180),
          y: start.y + (layer.shape === "circle" ? 140 : 120)
        }
      : point;
    let left = Math.min(start.x, end.x);
    let bottom = Math.min(start.y, end.y);
    let width = Math.max(1, Math.abs(end.x - start.x));
    let height = Math.max(1, Math.abs(end.y - start.y));

    if (layer.shape === "circle") {
      const size = Math.max(width, height);

      width = size;
      height = size;
      left = end.x < start.x ? start.x - size : start.x;
      bottom = end.y < start.y ? start.y - size : start.y;
    }

    layer.x = left;
    layer.y = bottom;
    layer.width = width;
    layer.height = height;
    layer.scaleX = 1;
    layer.scaleY = 1;
  }

  private applyDefaultSize() {
    if (!this.dragStart) {
      return;
    }

    this.updateDragLayer(this.dragStart, true);
  }

  private clientToWorld(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();

    return this.camera.screenToWorld(clientX - bounds.left, clientY - bounds.top);
  }
}

function getDefaultStrokeWidth() {
  return 6;
}

function getShapeName(shape: ShapeKind) {
  if (shape === "circle") {
    return "Circle";
  }

  return shape === "line" ? "Line" : "Rectangle";
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}
