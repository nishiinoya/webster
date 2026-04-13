import { Renderer } from "../webgl/Renderer";
import { Camera2D } from "./Camera2D";
import { Scene } from "./Scene";
import { ImageLayer } from "../layers/ImageLayer";

export type CameraSnapshot = {
  x: number;
  y: number;
  zoom: number;
};

export type LayerSummary = ReturnType<Scene["getLayerSummaries"]>[number];

export class EditorApp {
  private readonly renderer: Renderer;
  private readonly scene: Scene;
  private readonly camera: Camera2D;
  private animationFrameId: number | null = null;
  private isDisposed = false;
  private lastCameraSnapshot: CameraSnapshot | null = null;

  static async create(
    canvas: HTMLCanvasElement,
    onCameraChange?: (camera: CameraSnapshot) => void
  ) {
    return new EditorApp(canvas, await Renderer.create(canvas), onCameraChange);
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    renderer: Renderer,
    private readonly onCameraChange?: (camera: CameraSnapshot) => void
  ) {
    this.renderer = renderer;
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

  getLayerSummaries() {
    return this.scene.getLayerSummaries();
  }

  async addImageFile(file: File) {
    const image = await loadImageElement(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const maxInitialSize = 420;
    const scale = Math.min(1, maxInitialSize / Math.max(width, height));

    const layer = new ImageLayer({
      id: crypto.randomUUID(),
      name: file.name || "Image",
      image,
      objectUrl: image.src,
      x: (-width * scale) / 2,
      y: (-height * scale) / 2,
      width,
      height,
      scaleX: scale,
      scaleY: scale
    });

    this.scene.addLayer(layer);

    return layer;
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

async function loadImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;

  try {
    await image.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Unable to load image: ${file.name}`));
    });
  }

  return image;
}
