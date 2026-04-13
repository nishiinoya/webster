import { Renderer } from "../webgl/Renderer";
import { Camera2D } from "./Camera2D";
import { Scene } from "./Scene";

export type CameraSnapshot = {
  x: number;
  y: number;
  zoom: number;
};

export class EditorApp {
  private readonly renderer: Renderer;
  private readonly scene: Scene;
  private readonly camera: Camera2D;
  private animationFrameId: number | null = null;
  private isDisposed = false;
  private lastCameraSnapshot: CameraSnapshot | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onCameraChange?: (camera: CameraSnapshot) => void
  ) {
    this.renderer = new Renderer(canvas);
    this.scene = new Scene();
    this.camera = new Camera2D();
    this.camera.setBounds(this.scene.document);
  }

  start() {
    if (this.animationFrameId !== null || this.isDisposed) {
      return;
    }

    const tick = () => {
      if (this.isDisposed) {
        return;
      }

      this.renderer.render(this.scene, this.camera);
      this.animationFrameId = window.requestAnimationFrame(tick);
    };

    this.animationFrameId = window.requestAnimationFrame(tick);
  }

  dispose() {
    this.isDisposed = true;

    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.renderer.dispose();
    this.scene.dispose();
    this.camera.dispose();
  }

  panCamera(dx: number, dy: number) {
    this.camera.pan(dx, dy);
    this.notifyCameraChange();
  }

  zoomCameraAt(clientX: number, clientY: number, delta: number) {
    const { x, y } = this.getCanvasPoint(clientX, clientY);

    this.camera.zoomAt(x, y, delta);
    this.notifyCameraChange();
  }

  getCameraSnapshot() {
    return {
      x: this.camera.x,
      y: this.camera.y,
      zoom: this.camera.zoom
    };
  }

  private getCanvasPoint(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();

    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top
    };
  }

  private notifyCameraChange() {
    const snapshot = this.getCameraSnapshot();

    if (
      this.lastCameraSnapshot &&
      this.lastCameraSnapshot.x === snapshot.x &&
      this.lastCameraSnapshot.y === snapshot.y &&
      this.lastCameraSnapshot.zoom === snapshot.zoom
    ) {
      return;
    }

    this.lastCameraSnapshot = snapshot;
    this.onCameraChange?.(snapshot);
  }
}
