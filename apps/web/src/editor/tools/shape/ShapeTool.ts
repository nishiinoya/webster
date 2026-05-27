/** Shape creation tool implementation. */
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
  private customWorldPoints: Point[] = [];
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
      customPath: this.shape === "custom" ? [{ x: 0, y: 0 }] : null,
      fillColor: this.shape === "line" ? [0.18, 0.49, 0.44, 0] : [0.18, 0.49, 0.44, 1],
      strokeColor: [0.07, 0.08, 0.09, 1],
      strokeWidth: this.shape === "line" ? getDefaultStrokeWidth() : 0
    });

    this.dragStart = point;
    this.dragLayer = layer;
    this.customWorldPoints = this.shape === "custom" ? [point] : [];
    this.scene.addLayer(layer);

    return true;
  }

  pointerMove(event: ToolPointerEvent) {
    if (!this.dragLayer || !this.dragStart) {
      return false;
    }

    const point = this.clientToWorld(event.clientX, event.clientY);

    if (this.dragLayer.shape === "custom") {
      this.updateCustomLayer(point);
      return true;
    }

    this.updateDragLayer(point, false);

    return true;
  }

  pointerUp() {
    if (!this.dragLayer || !this.dragStart) {
      return false;
    }

    const didCreate = true;

    if (this.dragLayer.shape === "custom") {
      if (this.customWorldPoints.length < 3 || this.dragLayer.width < 2 || this.dragLayer.height < 2) {
        this.scene.removeLayer(this.dragLayer.id);
      }

      this.dragLayer = null;
      this.dragStart = null;
      this.customWorldPoints = [];

      return didCreate;
    }

    if (
      (this.dragLayer.shape === "line" && this.dragLayer.width < 2) ||
      (this.dragLayer.shape !== "line" && this.dragLayer.width < 2 && this.dragLayer.height < 2)
    ) {
      this.applyDefaultSize();
    }

    this.dragLayer = null;
    this.dragStart = null;
    this.customWorldPoints = [];

    return didCreate;
  }

  cancel() {
    this.dragLayer = null;
    this.dragStart = null;
    this.customWorldPoints = [];
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
          x: start.x + (layer.shape === "circle" || layer.shape === "diamond" ? 140 : 180),
          y: start.y + (layer.shape === "circle" || layer.shape === "diamond" ? 140 : 120)
        }
      : point;
    let left = Math.min(start.x, end.x);
    let bottom = Math.min(start.y, end.y);
    let width = Math.max(1, Math.abs(end.x - start.x));
    let height = Math.max(1, Math.abs(end.y - start.y));

    if (layer.shape === "circle" || layer.shape === "diamond") {
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

  private updateCustomLayer(point: Point) {
    const layer = this.dragLayer;

    if (!layer) {
      return;
    }

    const previousPoint = this.customWorldPoints.at(-1);
    const minDistance = 1 / Math.max(this.camera.zoom, 1e-6);

    if (
      previousPoint &&
      Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < minDistance
    ) {
      return;
    }

    this.customWorldPoints.push(point);

    const bounds = getPointBounds(this.customWorldPoints);

    layer.x = bounds.x;
    layer.y = bounds.y;
    layer.width = bounds.width;
    layer.height = bounds.height;
    layer.scaleX = 1;
    layer.scaleY = 1;
    layer.customPath = this.customWorldPoints.map((worldPoint) => ({
      x: worldPoint.x - bounds.x,
      y: worldPoint.y - bounds.y
    }));
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
  switch (shape) {
    case "arrow":
      return "Arrow";
    case "circle":
      return "Circle";
    case "custom":
      return "Custom shape";
    case "diamond":
      return "Diamond";
    case "line":
      return "Line";
    case "triangle":
      return "Triangle";
    case "rectangle":
      return "Rectangle";
  }
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

function getPointBounds(points: Point[]) {
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
