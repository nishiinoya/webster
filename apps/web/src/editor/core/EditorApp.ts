import { Renderer } from "../webgl/Renderer";
import { Camera2D } from "./Camera2D";
import { Scene } from "./Scene";

export class EditorApp {
  private readonly renderer: Renderer;
  private readonly scene: Scene;
  private readonly camera: Camera2D;
  private animationFrameId: number | null = null;
  private isDisposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.scene = new Scene();
    this.camera = new Camera2D();
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
}
