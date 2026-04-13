import { Camera2D } from "../core/Camera2D";
import { Scene } from "../core/Scene";
import { Layer } from "../layers/Layer";

export type ToolPointerEvent = {
  button: number;
  clientX: number;
  clientY: number;
};

type DragState = {
  layer: Layer;
  offsetX: number;
  offsetY: number;
};

export class MoveTool {
  private dragState: DragState | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
    private readonly camera: Camera2D
  ) {}

  pointerDown(event: ToolPointerEvent) {
    if (event.button !== 0) {
      return false;
    }

    const worldPoint = this.clientToWorld(event.clientX, event.clientY);
    const layer = this.scene.hitTestLayer(worldPoint.x, worldPoint.y);

    if (!layer) {
      this.dragState = null;
      return false;
    }

    this.scene.selectLayer(layer.id);

    if (layer.locked) {
      this.dragState = null;
      return true;
    }

    this.dragState = {
      layer,
      offsetX: worldPoint.x - layer.x,
      offsetY: worldPoint.y - layer.y
    };

    return true;
  }

  pointerMove(event: ToolPointerEvent) {
    if (!this.dragState || this.dragState.layer.locked) {
      return false;
    }

    const worldPoint = this.clientToWorld(event.clientX, event.clientY);

    this.scene.moveLayer(
      this.dragState.layer.id,
      worldPoint.x - this.dragState.offsetX,
      worldPoint.y - this.dragState.offsetY
    );

    return true;
  }

  pointerUp() {
    const wasDragging = this.dragState !== null;
    this.dragState = null;

    return wasDragging;
  }

  cancel() {
    this.dragState = null;
  }

  private clientToWorld(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();

    return this.camera.screenToWorld(clientX - bounds.left, clientY - bounds.top);
  }
}
