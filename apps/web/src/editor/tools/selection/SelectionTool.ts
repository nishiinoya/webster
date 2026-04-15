import { Camera2D } from "../../geometry/Camera2D";
import { Scene } from "../../scene/Scene";
import type { SelectionShape } from "../../selection/SelectionManager";
import type { ToolPointerEvent } from "../move/MoveTool";

type DragStart = {
  x: number;
  y: number;
};

export class SelectionTool {
  private dragStart: DragStart | null = null;
  private shape: SelectionShape = "rectangle";

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
    this.shape = shape;
  }

  pointerDown(event: ToolPointerEvent) {
    if (event.button !== 0) {
      return false;
    }

    const point = this.clientToWorld(event.clientX, event.clientY);

    this.dragStart = point;
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

    this.scene.selection.setDraft(this.shape, {
      height: point.y - this.dragStart.y,
      width: point.x - this.dragStart.x,
      x: this.dragStart.x,
      y: this.dragStart.y
    });

    return true;
  }

  pointerUp() {
    const didDrag = Boolean(this.dragStart);

    if (didDrag) {
      this.scene.selection.commitDraft(2 / Math.max(this.camera.zoom, 1e-6));
    }

    this.cancel();
    return didDrag;
  }

  cancel() {
    this.dragStart = null;
    this.scene.selection.cancelDraft();
  }

  getCursor() {
    return "crosshair" as const;
  }

  private clientToWorld(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();

    return this.camera.screenToWorld(clientX - bounds.left, clientY - bounds.top);
  }
}
