import { Camera2D } from "../../geometry/Camera2D";
import { StrokeLayer } from "../../layers/StrokeLayer";
import type { StrokePoint, StrokeStyle } from "../../layers/StrokeLayer";
import { Scene } from "../../scene/Scene";
import type { ToolPointerEvent } from "../move/MoveTool";

export type DrawingToolOptions = {
  color: [number, number, number, number];
  mode: "draw" | "erase";
  style: StrokeStyle;
  targetLayerId: string | null;
  targetMode: "layer" | "new" | "selected";
  strokeWidth: number;
};

export class DrawingTool {
  private activeLayer: StrokeLayer | null = null;
  private activePathIndex = -1;
  private isErasing = false;
  private points: StrokePoint[] = [];
  private options: DrawingToolOptions = {
    color: [0.07, 0.08, 0.09, 0.82],
    mode: "draw",
    strokeWidth: 3,
    style: "pencil",
    targetLayerId: null,
    targetMode: "new"
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private scene: Scene,
    private readonly camera: Camera2D
  ) {}

  setScene(scene: Scene) {
    this.cancel();
    this.scene = scene;
  }

  setOptions(options: Partial<DrawingToolOptions>) {
    this.options = {
      color: options.color ?? this.options.color,
      mode: options.mode ?? this.options.mode,
      strokeWidth: Math.max(1, options.strokeWidth ?? this.options.strokeWidth),
      style: options.style ?? this.options.style,
      targetLayerId:
        options.targetLayerId === undefined ? this.options.targetLayerId : options.targetLayerId,
      targetMode: options.targetMode ?? this.options.targetMode
    };
  }

  pointerDown(event: ToolPointerEvent) {
    if (event.button !== 0) {
      return false;
    }

    if (this.options.mode === "erase") {
      return this.startErase(event);
    }

    const point = this.clientToWorld(event.clientX, event.clientY);
    const preset = getStrokePreset(this.options.style);
    const targetLayer = this.getDrawTargetLayer();
    const layer =
      targetLayer ??
      new StrokeLayer({
        id: crypto.randomUUID(),
        name: preset.name,
        x: point.x,
        y: point.y,
        width: 1,
        height: 1,
        color: this.options.color,
        strokeStyle: this.options.style,
        strokeWidth: this.options.strokeWidth
      });

    this.points = [point];
    this.activeLayer = layer;
    this.activePathIndex = layer.paths.length;
    layer.appendWorldPath(this.points, {
      color: this.options.color,
      strokeStyle: this.options.style,
      strokeWidth: this.options.strokeWidth
    });

    if (!targetLayer) {
      this.scene.addLayer(layer);
    } else {
      this.scene.selectLayer(layer.id);
    }

    return true;
  }

  pointerMove(event: ToolPointerEvent) {
    if (this.isErasing) {
      return this.eraseAtEvent(event);
    }

    if (!this.activeLayer) {
      return false;
    }

    const point = this.clientToWorld(event.clientX, event.clientY);
    const lastPoint = this.points.at(-1);

    if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 1.5 / this.camera.zoom) {
      return false;
    }

    this.points.push(point);
    this.activeLayer.setWorldPathAt(this.activePathIndex, this.points);

    return true;
  }

  pointerUp() {
    if (this.isErasing) {
      this.isErasing = false;
      this.activeLayer = null;
      return true;
    }

    if (!this.activeLayer) {
      return false;
    }

    if (this.points.length === 1) {
      const point = this.points[0];

      this.points.push({
        x: point.x + 0.1,
        y: point.y + 0.1
      });
      this.activeLayer.setWorldPathAt(this.activePathIndex, this.points);
    }

    this.activeLayer = null;
    this.activePathIndex = -1;
    this.points = [];

    return true;
  }

  cancel() {
    this.activeLayer = null;
    this.activePathIndex = -1;
    this.isErasing = false;
    this.points = [];
  }

  getCursor() {
    return "crosshair" as const;
  }

  private clientToWorld(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();

    return this.camera.screenToWorld(clientX - bounds.left, clientY - bounds.top);
  }

  private getDrawTargetLayer() {
    if (this.options.targetMode === "new") {
      return null;
    }

    const layerId =
      this.options.targetMode === "layer"
        ? this.options.targetLayerId
        : this.scene.selectedLayerId;

    const layer = layerId ? this.scene.getLayer(layerId) : null;

    if (layer instanceof StrokeLayer && !layer.locked) {
      return layer;
    }

    return null;
  }

  private startErase(event: ToolPointerEvent) {
    const selectedLayer = this.getDrawTargetLayer();

    if (!(selectedLayer instanceof StrokeLayer) || selectedLayer.locked) {
      return false;
    }

    this.activeLayer = selectedLayer;
    this.isErasing = true;

    return this.eraseAtEvent(event);
  }

  private eraseAtEvent(event: ToolPointerEvent) {
    const layer = this.activeLayer;

    if (!layer || layer.locked) {
      return false;
    }

    const point = this.clientToWorld(event.clientX, event.clientY);
    const radius = Math.max(1, this.options.strokeWidth / 2);
    const hasRemainingStrokes = layer.eraseWorldCircle(point, radius);

    if (!hasRemainingStrokes) {
      this.scene.removeLayer(layer.id);
      this.activeLayer = null;
      this.isErasing = false;
    }

    return true;
  }
}

function getStrokePreset(style: StrokeStyle) {
  switch (style) {
    case "brush":
      return {
        color: [0.05, 0.06, 0.07, 0.88] as [number, number, number, number],
        name: "Brush stroke",
        strokeWidth: 14
      };
    case "highlighter":
      return {
        color: [1, 0.78, 0.22, 0.36] as [number, number, number, number],
        name: "Highlighter stroke",
        strokeWidth: 30
      };
    case "marker":
      return {
        color: [0.1, 0.42, 0.88, 0.95] as [number, number, number, number],
        name: "Marker stroke",
        strokeWidth: 22
      };
    case "pen":
      return {
        color: [0.07, 0.08, 0.09, 1] as [number, number, number, number],
        name: "Pen stroke",
        strokeWidth: 6
      };
    case "pencil":
      return {
        color: [0.07, 0.08, 0.09, 0.82] as [number, number, number, number],
        name: "Pencil stroke",
        strokeWidth: 3
      };
  }
}
