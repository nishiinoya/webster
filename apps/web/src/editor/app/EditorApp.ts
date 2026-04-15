import { editorRenderOptions, imageExportRenderOptions, Renderer } from "../rendering/Renderer";
import { InputController } from "../tools/input/InputController";
import type { MaskBrushOptions } from "../tools/mask-brush/MaskBrushTypes";
import type { ToolPointerEvent } from "../tools/move/MoveTool";
import { Camera2D } from "../geometry/Camera2D";
import { Scene } from "../scene/Scene";
import type { LayerMaskAction } from "../scene/Scene";
import { exportScenePackage, importScenePackage } from "../projects/ProjectPackage";
import { ImageLayer } from "../layers/ImageLayer";

export type CameraSnapshot = {
  x: number;
  y: number;
  zoom: number;
};

export type LayerSummary = ReturnType<Scene["getLayerSummaries"]>[number];

export type LayerUpdate = Parameters<Scene["updateLayer"]>[1];

export type LayerCommand =
  | { type: "delete"; layerId: string }
  | { type: "duplicate"; layerId: string }
  | { type: "mask"; action: LayerMaskAction; layerId: string }
  | { type: "move-down"; layerId: string }
  | { type: "move-up"; layerId: string }
  | { type: "select"; layerId: string }
  | { type: "update"; layerId: string; updates: LayerUpdate };

export type SelectionCommand = "clear" | "convert-to-mask" | "invert";

export type ImageExportBackground = "checkerboard" | "transparent" | "white";

export type ImageExportFormat = "jpeg" | "png";

export class EditorApp {
  private readonly renderer: Renderer;
  private scene: Scene;
  private readonly camera: Camera2D;
  private readonly inputController: InputController;
  private animationFrameId: number | null = null;
  private isDisposed = false;
  private activeDocumentId: string | null = null;
  private lastCameraSnapshot: CameraSnapshot | null = null;
  private selectedTool = "Move";
  private readonly tabScenes = new Map<string, Scene>();

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
    this.scene = new Scene({ createDefaultLayer: false });
    this.camera = new Camera2D();
    this.camera.setBounds(this.scene.document);
    this.inputController = new InputController(canvas, this.scene, this.camera);
  }

  start() {
    if (this.animationFrameId !== null || this.isDisposed) {
      return;
    }

    const tick = () => {
      if (this.isDisposed) {
        return;
      }

      this.renderer.render(this.scene, this.camera, {
        ...editorRenderOptions,
        showSelectionOutline: shouldShowSelectionOutline(this.selectedTool)
      });
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
    for (const tabScene of this.tabScenes.values()) {
      if (tabScene !== this.scene) {
        tabScene.dispose();
      }
    }
    this.tabScenes.clear();
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

  getScene() {
    return this.scene;
  }

  createDocument(width: number, height: number) {
    this.replaceScene(
      new Scene({
        createDefaultLayer: false,
        documentHeight: height,
        documentWidth: width
      })
    );

    return this.scene;
  }

  replaceScene(nextScene: Scene, options: { disposeCurrent?: boolean } = {}) {
    if (nextScene === this.scene) {
      return this.scene;
    }

    if (options.disposeCurrent ?? true) {
      this.scene.dispose();
    }

    this.scene = nextScene;
    this.camera.setBounds(this.scene.document);
    this.inputController.setScene(this.scene);
    this.notifyCameraChange();

    return this.scene;
  }

  switchDocument(document: { height: number; id: string; width: number }) {
    if (this.activeDocumentId === document.id) {
      return this.scene;
    }

    if (this.activeDocumentId) {
      this.tabScenes.set(this.activeDocumentId, this.scene);
    }

    let nextScene = this.tabScenes.get(document.id);

    if (!nextScene) {
      nextScene = new Scene({
        createDefaultLayer: false,
        documentHeight: document.height,
        documentWidth: document.width
      });
    }

    this.tabScenes.set(document.id, nextScene);
    this.replaceScene(nextScene, { disposeCurrent: false });
    this.activeDocumentId = document.id;

    return this.scene;
  }

  rememberDocument(documentId: string) {
    this.activeDocumentId = documentId;
    this.tabScenes.set(documentId, this.scene);
  }

  forgetDocument(documentId: string) {
    const scene = this.tabScenes.get(documentId);

    if (scene && scene !== this.scene) {
      scene.dispose();
    }

    this.tabScenes.delete(documentId);

    if (this.activeDocumentId === documentId) {
      this.activeDocumentId = null;
    }
  }

  async exportProjectFile() {
    return exportScenePackage(this.scene);
  }

  async exportImageFile(format: ImageExportFormat, background: ImageExportBackground) {
    const canvas = document.createElement("canvas");
    const renderer = await Renderer.create(canvas, {
      alpha: format === "png" && background === "transparent",
      preserveDrawingBuffer: true
    });
    const camera = new Camera2D();
    const width = Math.max(1, Math.round(this.scene.document.width));
    const height = Math.max(1, Math.round(this.scene.document.height));

    camera.x = this.scene.document.x + this.scene.document.width / 2;
    camera.y = this.scene.document.y + this.scene.document.height / 2;
    camera.zoom = 1;

    try {
      renderer.renderToSize(
        this.scene,
        camera,
        {
          ...imageExportRenderOptions,
          documentBackground: background
        },
        width,
        height
      );

      return await canvasToBlob(
        canvas,
        format === "jpeg" ? "image/jpeg" : "image/png",
        format === "jpeg" ? 0.92 : undefined
      );
    } finally {
      renderer.dispose();
      camera.dispose();
    }
  }

  async importProjectFile(file: File) {
    const nextScene = await importScenePackage(file);
    this.replaceScene(nextScene);

    return this.scene;
  }

  setSelectedTool(tool: string) {
    this.selectedTool = tool;
    this.inputController.setSelectedTool(tool);
  }

  setMaskBrushOptions(options: Partial<MaskBrushOptions>) {
    this.inputController.setMaskBrushOptions(options);
  }

  selectLayer(layerId: string | null) {
    return this.scene.selectLayer(layerId);
  }

  applyLayerCommand(command: LayerCommand) {
    switch (command.type) {
      case "delete":
        return this.scene.removeLayer(command.layerId);
      case "duplicate":
        return this.scene.duplicateLayer(command.layerId);
      case "mask":
        return this.scene.updateLayerMask(command.layerId, command.action);
      case "move-down":
        return this.scene.moveLayerBackward(command.layerId);
      case "move-up":
        return this.scene.moveLayerForward(command.layerId);
      case "select":
        return this.scene.selectLayer(command.layerId);
      case "update":
        return this.scene.updateLayer(command.layerId, command.updates);
    }
  }

  applySelectionCommand(command: SelectionCommand) {
    if (command === "clear") {
      this.scene.selection.clear();
      return true;
    }

    if (command === "invert") {
      return this.scene.selection.invert();
    }

    const layer = this.scene.selectedLayerId ? this.scene.getLayer(this.scene.selectedLayerId) : null;

    if (command === "convert-to-mask" && layer && !layer.locked) {
      return this.scene.selection.convertToLayerMask(layer);
    }

    return false;
  }

  selectLayerAt(clientX: number, clientY: number) {
    const screenPoint = this.getCanvasPoint(clientX, clientY);
    const worldPoint = this.camera.screenToWorld(screenPoint.x, screenPoint.y);
    const layer = this.scene.hitTestLayer(worldPoint.x, worldPoint.y);

    if (layer) {
      this.scene.selectLayer(layer.id);
    }

    return layer;
  }

  pointerDown(event: ToolPointerEvent) {
    return this.inputController.pointerDown(event);
  }

  pointerMove(event: ToolPointerEvent) {
    return this.inputController.pointerMove(event);
  }

  pointerUp() {
    return this.inputController.pointerUp();
  }

  cancelInput() {
    this.inputController.cancel();
  }

  undoLastMaskStroke() {
    return this.inputController.undoLastMaskStroke();
  }

  getCursor(clientX: number, clientY: number) {
    return this.inputController.getCursor(clientX, clientY);
  }

  async addImageFile(file: File) {
    const image = await loadImageElement(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const maxInitialSize = 420;
    const scale = Math.min(1, maxInitialSize / Math.max(width, height));

    const layer = new ImageLayer({
      assetId: crypto.randomUUID(),
      id: crypto.randomUUID(),
      name: file.name || "Image",
      image,
      mimeType: file.type || "image/png",
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

function shouldShowSelectionOutline(tool: string) {
  return tool === "Move";
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

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Unable to export image."));
      },
      mimeType,
      quality
    );
  });
}
