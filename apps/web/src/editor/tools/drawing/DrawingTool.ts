import { Camera2D } from "../../geometry/Camera2D";
import { StrokeLayer } from "../../layers/StrokeLayer";
import type { StrokePoint, StrokeSelectionClip, StrokeStyle } from "../../layers/StrokeLayer";
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
  private isDrawing = false;
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
    this.isDrawing = true;

    if (!this.scene.selection.containsWorldPoint(point.x, point.y)) {
      this.points = [];
      this.activeLayer = null;
      this.activePathIndex = -1;
      return true;
    }

    return this.startStrokeAt(point);
  }

  private startStrokeAt(point: StrokePoint) {
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
      selectionClip: cloneSelectionClip(this.scene.selection.current),
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

    if (!this.isDrawing) {
      return false;
    }

    const point = this.clientToWorld(event.clientX, event.clientY);
    const isInsideSelection = this.scene.selection.containsWorldPoint(point.x, point.y);

    if (!isInsideSelection) {
      this.activeLayer = null;
      this.activePathIndex = -1;
      this.points = [];
      return true;
    }

    if (!this.activeLayer) {
      return this.startStrokeAt(point);
    }

    const lastPoint = this.points.at(-1);

    if (!lastPoint) {
      this.points.push(point);
      this.activeLayer.setWorldPathAt(this.activePathIndex, this.points);
      return true;
    }

    const dx = point.x - lastPoint.x;
    const dy = point.y - lastPoint.y;
    const distance = Math.hypot(dx, dy);
    const spacing = Math.max(0.5 / this.camera.zoom, this.options.strokeWidth * 0.18);

    if (distance < spacing) {
      return false;
    }

    const stepCount = Math.max(1, Math.floor(distance / spacing));

    for (let index = 1; index <= stepCount; index += 1) {
      const amount = index / stepCount;

      this.points.push({
        x: lastPoint.x + dx * amount,
        y: lastPoint.y + dy * amount
      });
    }

    this.activeLayer.setWorldPathAt(this.activePathIndex, this.points);

    return true;
  }

  pointerUp() {
    if (this.isErasing) {
      this.isErasing = false;
      this.activeLayer = null;
      this.isDrawing = false;
      return true;
    }

    if (!this.isDrawing) {
      return false;
    }

    if (this.activeLayer && this.points.length === 1) {
      const point = this.points[0];

      this.points.push({
        x: point.x + 0.1,
        y: point.y + 0.1
      });
      this.activeLayer.setWorldPathAt(this.activePathIndex, this.points);
    }

    this.activeLayer = null;
    this.activePathIndex = -1;
    this.isDrawing = false;
    this.points = [];

    return true;
  }

  cancel() {
    this.activeLayer = null;
    this.activePathIndex = -1;
    this.isErasing = false;
    this.isDrawing = false;
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
    this.isDrawing = true;

    return this.eraseAtEvent(event);
  }

  private eraseAtEvent(event: ToolPointerEvent) {
    const layer = this.activeLayer;

    if (!layer || layer.locked) {
      return false;
    }

    const point = this.clientToWorld(event.clientX, event.clientY);

    if (!this.scene.selection.containsWorldPoint(point.x, point.y)) {
      return true;
    }

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

function cloneSelectionClip(selection: StrokeSelectionClip | null): StrokeSelectionClip | null {
  return selection
    ? {
        bounds: {
          height: selection.bounds.height,
          width: selection.bounds.width,
          x: selection.bounds.x,
          y: selection.bounds.y
        },
        inverted: selection.inverted,
        shape: selection.shape
      }
    : null;
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
