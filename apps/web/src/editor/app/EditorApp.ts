import { editorRenderOptions, imageExportRenderOptions, Renderer } from "../rendering/Renderer";
import { InputController } from "../tools/input/InputController";
import type { MaskBrushOptions } from "../tools/mask-brush/MaskBrushTypes";
import type { DrawingToolOptions } from "../tools/drawing/DrawingTool";
import type { ToolPointerEvent } from "../tools/move/MoveTool";
import { Camera2D } from "../geometry/Camera2D";
import { Scene } from "../scene/Scene";
import type { DocumentResizeAnchor, LayerMaskAction } from "../scene/Scene";
import { exportScenePackage, importScenePackage } from "../projects/ProjectPackage";
import { ImageLayer } from "../layers/ImageLayer";
import { TextLayer } from "../layers/TextLayer";
import type { ShapeKind } from "../layers/ShapeLayer";
import {
  createBlankDocumentScene,
  forgetEditorDocument,
  rememberEditorDocument,
  replaceEditorScene,
  switchEditorDocument
} from "./document/documentLifecycle";
import {
  canvasToBlob,
  createPdfFromJpeg,
  getExportRenderBackground
} from "./export/exportFileUtils";
import type { ImageExportBackground, ImageExportFormat } from "./export/exportFileUtils";
import {
  clampImagePixels,
  loadImageElement
} from "./image/imageFileUtils";
import {
  addImageFileToScene,
  createImageDocumentFromFile,
  resampleImageLayerInScene,
  restoreOriginalImageLayerInScene
} from "./image/imageLayerOperations";
import {
  applyDocumentCommandToScene,
  applyImageLayerCommandToScene,
  applyLayerCommandToScene,
  applySelectionCommandToScene
} from "./commands/commandDispatch";
import {
  clearTextSelection,
  createDefaultTextLayer,
  deleteTextBackward as deleteTextBackwardState,
  deleteTextForward as deleteTextForwardState,
  endTextSelection as endTextSelectionState,
  finishTextEdit as finishTextEditState,
  getSelectedTextInput as getSelectedTextInputState,
  insertTextInput as insertTextInputState,
  moveTextCaret as moveTextCaretState,
  selectAllTextInput as selectAllTextInputState,
  startTextEditAtClientPoint as startTextEditAtClientPointState,
  startTextSelectionAtClientPoint as startTextSelectionAtClientPointState,
  updateTextSelectionAtClientPoint as updateTextSelectionAtClientPointState
} from "./text/textEditing";
import type { TextEditingState } from "./text/textEditing";

export type { ImageExportBackground, ImageExportFormat } from "./export/exportFileUtils";


export type CameraSnapshot = {
  x: number;
  y: number;
  zoom: number;
};

export type LayerSummary = ReturnType<Scene["getLayerSummaries"]>[number];

export type LayerUpdate = Parameters<Scene["updateLayer"]>[1];

export type DocumentCommand = {
  anchor?: DocumentResizeAnchor;
  height: number;
  type: "resize";
  width: number;
};

export type ImageLayerCommand =
  | {
      height: number;
      layerId: string;
      type: "resample";
      width: number;
    }
  | {
      layerId: string;
      type: "restore-original";
    };

export type LayerCommand =
  | { type: "add-adjustment" }
  | { type: "delete"; layerId: string }
  | { type: "duplicate"; layerId: string }
  | { type: "mask"; action: LayerMaskAction; layerId: string }
  | { type: "move-down"; layerId: string }
  | { type: "move-up"; layerId: string }
  | { type: "select"; layerId: string }
  | { type: "update"; layerId: string; updates: LayerUpdate };

export type SelectionCommand = "clear" | "convert-to-mask" | "invert";

/**
 * Coordinates the active scene, renderer, tool input, and document-level editor workflows.
 */
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
  private showCanvasBorder = true;
  private textEditLayerId: string | null = null;
  private textCaretIndex = 0;
  private textSelectionEnd: number | null = null;
  private textSelectionStart: number | null = null;
  private readonly tabScenes = new Map<string, Scene>();

  /**
   * Creates the app coordinator and initializes the shared renderer.
   */
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

  private get textEditingState(): TextEditingState {
    return {
      caretIndex: this.textCaretIndex,
      layerId: this.textEditLayerId,
      selectionEnd: this.textSelectionEnd,
      selectionStart: this.textSelectionStart
    };
  }

  private set textEditingState(state: TextEditingState) {
    this.textCaretIndex = state.caretIndex;
    this.textEditLayerId = state.layerId;
    this.textSelectionEnd = state.selectionEnd;
    this.textSelectionStart = state.selectionStart;
  }

  /**
   * Starts the render loop if it is not already running.
   */
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
        showCanvasBorder: this.showCanvasBorder,
        showSelectionOutline: shouldShowSelectionOutline(this.selectedTool),
        textEdit: this.textEditLayerId
          ? {
              caretIndex: this.textCaretIndex,
              layerId: this.textEditLayerId,
              selectionEnd: this.textSelectionEnd,
              selectionStart: this.textSelectionStart
            }
          : null
      });
      this.animationFrameId = window.requestAnimationFrame(tick);
    };

    this.animationFrameId = window.requestAnimationFrame(tick);
  }

  /**
   * Stops rendering and disposes all editor-owned resources.
   */
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

  getDocumentSnapshot() {
    return {
      height: this.scene.document.height,
      width: this.scene.document.width,
      x: this.scene.document.x,
      y: this.scene.document.y
    };
  }

  /**
   * Replaces the current scene with a new blank document scene.
   */
  createDocument(width: number, height: number) {
    this.replaceScene(createBlankDocumentScene(width, height));

    return this.scene;
  }

  /**
   * Replaces the current scene with a document created from an imported image file.
   */
  async createImageDocument(file: File) {
    const scene = await createImageDocumentFromFile(file);

    this.replaceScene(scene);
    this.camera.fitBounds(scene.document);
    this.notifyCameraChange();

    return scene;
  }

  /**
   * Swaps the active scene and rebinds camera and input systems to it.
   */
  replaceScene(nextScene: Scene, options: { disposeCurrent?: boolean } = {}) {
    this.scene = replaceEditorScene({
      camera: this.camera,
      currentScene: this.scene,
      disposeCurrent: options.disposeCurrent,
      inputController: this.inputController,
      nextScene,
      notifyCameraChange: this.notifyCameraChange.bind(this)
    });

    return this.scene;
  }

  /**
   * Switches the active document tab, creating a blank scene when needed.
   */
  switchDocument(document: { height: number; id: string; width: number }) {
    const result = switchEditorDocument({
      activeDocumentId: this.activeDocumentId,
      currentScene: this.scene,
      document,
      replaceScene: this.replaceScene.bind(this),
      tabScenes: this.tabScenes
    });
    this.activeDocumentId = result.activeDocumentId;

    return this.scene;
  }

  rememberDocument(documentId: string) {
    this.activeDocumentId = rememberEditorDocument(this.tabScenes, documentId, this.scene);
  }

  forgetDocument(documentId: string) {
    this.activeDocumentId = forgetEditorDocument({
      activeDocumentId: this.activeDocumentId,
      currentScene: this.scene,
      documentId,
      tabScenes: this.tabScenes
    });
  }

  /**
   * Exports the active scene as a native project package.
   */
  async exportProjectFile() {
    return exportScenePackage(this.scene);
  }

  /**
   * Renders the current scene into an exported image or PDF blob using an offscreen renderer.
   */
  async exportImageFile(format: ImageExportFormat, background: ImageExportBackground) {
    this.finishTextEdit();

    const canvas = document.createElement("canvas");
    const renderer = await Renderer.create(canvas, {
      alpha: format === "png" && background === "transparent",
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    });
    const camera = new Camera2D();
    const width = Math.max(1, Math.round(this.scene.document.width));
    const height = Math.max(1, Math.round(this.scene.document.height));

    camera.x = this.scene.document.x + this.scene.document.width / 2;
    camera.y = this.scene.document.y + this.scene.document.height / 2;
    camera.zoom = 1;

    try {
      await renderer.prepareSceneFonts(this.scene);

      renderer.renderToSize(
        this.scene,
        camera,
        {
          ...imageExportRenderOptions,
          documentBackground: getExportRenderBackground(format, background)
        },
        width,
        height
      );

      if (format === "pdf") {
        const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.92);

        return createPdfFromJpeg(jpeg, width, height);
      }

      return await canvasToBlob(canvas, format === "jpeg" ? "image/jpeg" : "image/png", 0.92);
    } finally {
      renderer.dispose();
      camera.dispose();
    }
  }

  /**
   * Imports a project package and replaces the active scene with it.
   */
  async importProjectFile(file: File) {
    const nextScene = await importScenePackage(file);
    this.replaceScene(nextScene);

    return this.scene;
  }

  setSelectedTool(tool: string) {
    this.selectedTool = tool;
    this.inputController.setSelectedTool(tool);

    if (tool !== "Text") {
      this.finishTextEdit();
    }
  }

  setShowCanvasBorder(showCanvasBorder: boolean) {
    this.showCanvasBorder = showCanvasBorder;
  }

  setMaskBrushOptions(options: Partial<MaskBrushOptions>) {
    this.inputController.setMaskBrushOptions(options);
  }

  setDrawingToolOptions(options: Partial<DrawingToolOptions>) {
    this.inputController.setDrawingToolOptions(options);
  }

  setShapeToolKind(shape: ShapeKind) {
    this.inputController.setShape(shape);
  }

  selectLayer(layerId: string | null) {
    return this.scene.selectLayer(layerId);
  }

  /**
   * Applies a layer command against the active scene.
   */
  applyLayerCommand(command: LayerCommand) {
    return applyLayerCommandToScene(this.scene, command);
  }

  /**
   * Applies a document command and keeps camera bounds in sync.
   */
  applyDocumentCommand(command: DocumentCommand) {
    return applyDocumentCommandToScene(this.scene, command, (document) => {
      this.camera.setBounds(document);
      this.notifyCameraChange();
    });
  }

  /**
   * Applies an image-layer command against the active scene.
   */
  async applyImageLayerCommand(command: ImageLayerCommand) {
    return applyImageLayerCommandToScene(command, {
      resampleImageLayer: this.resampleImageLayer.bind(this),
      restoreOriginalImageLayer: this.restoreOriginalImageLayer.bind(this)
    });
  }

  /**
   * Applies a selection command against the active scene selection.
   */
  applySelectionCommand(command: SelectionCommand) {
    return applySelectionCommandToScene(this.scene, command);
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

  startTextEditAtClientPoint(clientX: number, clientY: number) {
    const state = this.textEditingState;
    const result = startTextEditAtClientPointState({
      camera: this.camera,
      clientX,
      clientY,
      getCanvasPoint: this.getCanvasPoint.bind(this),
      scene: this.scene,
      state
    });

    this.textEditingState = state;

    return result;
  }

  startTextSelectionAtClientPoint(clientX: number, clientY: number) {
    const state = this.textEditingState;
    const result = startTextSelectionAtClientPointState({
      camera: this.camera,
      clientX,
      clientY,
      getCanvasPoint: this.getCanvasPoint.bind(this),
      scene: this.scene,
      state
    });

    this.textEditingState = state;

    return result;
  }

  updateTextSelectionAtClientPoint(clientX: number, clientY: number) {
    const state = this.textEditingState;
    const result = updateTextSelectionAtClientPointState({
      camera: this.camera,
      clientX,
      clientY,
      getCanvasPoint: this.getCanvasPoint.bind(this),
      scene: this.scene,
      state
    });

    this.textEditingState = state;

    return result;
  }

  endTextSelection() {
    return endTextSelectionState(this.textEditingState);
  }

  finishTextEdit() {
    const state = this.textEditingState;
    finishTextEditState(state);
    this.textEditingState = state;
  }

  insertTextInput(text: string) {
    const state = this.textEditingState;
    const result = insertTextInputState(this.scene, state, text);
    this.textEditingState = state;
    return result;
  }

  deleteTextBackward() {
    const state = this.textEditingState;
    const result = deleteTextBackwardState(this.scene, state);
    this.textEditingState = state;
    return result;
  }

  deleteTextForward() {
    const state = this.textEditingState;
    const result = deleteTextForwardState(this.scene, state);
    this.textEditingState = state;
    return result;
  }

  getSelectedTextInput() {
    return getSelectedTextInputState(this.scene, this.textEditingState);
  }

  selectAllTextInput() {
    const state = this.textEditingState;
    const result = selectAllTextInputState(this.scene, state);
    this.textEditingState = state;
    return result;
  }

  moveTextCaret(direction: "end" | "home" | "left" | "right") {
    const state = this.textEditingState;
    const result = moveTextCaretState(this.scene, state, direction);
    this.textEditingState = state;
    return result;
  }

  async addImageFile(file: File) {
    return addImageFileToScene(this.scene, file);
  }

  private async resampleImageLayer(layerId: string, width: number, height: number) {
    return resampleImageLayerInScene(this.scene, layerId, width, height);
  }

  private restoreOriginalImageLayer(layerId: string) {
    return restoreOriginalImageLayerInScene(this.scene, layerId);
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

  addTextLayer() {
    const layer = createDefaultTextLayer();

    this.scene.addLayer(layer);

    return layer;
  }
}

function shouldShowSelectionOutline(tool: string) {
  return tool === "Move" || tool === "Text";
}
