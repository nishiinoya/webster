import { editorRenderOptions, imageExportRenderOptions, Renderer } from "../rendering/Renderer";
import { InputController } from "../tools/input/InputController";
import type { MaskBrushOptions } from "../tools/mask-brush/MaskBrushTypes";
import type { DrawingToolOptions } from "../tools/drawing/DrawingTool";
import type { ToolPointerEvent } from "../tools/move/MoveTool";
import { Camera2D } from "../geometry/Camera2D";
import { Scene } from "../scene/Scene";
import type { SceneSnapshot } from "../scene/sceneSnapshots";
import {
  areSceneSnapshotsEqual,
  captureSceneSnapshot,
  cloneSceneSnapshot,
  restoreSceneSnapshot
} from "../scene/sceneSnapshots";
import type { DocumentResizeAnchor, LayerMaskAction, LayerStackPlacement } from "../scene/Scene";
import { exportScenePackage, importScenePackage } from "../projects/ProjectPackage";
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
import { EditorHistory } from "./history/EditorHistory";
import type { HistoryStateSnapshot } from "./history/EditorHistory";
import type {
  SharedEditorAction,
  SharedEditorActionDraft
} from "./history/SharedEditorAction";

export type { ImageExportBackground, ImageExportFormat } from "./export/exportFileUtils";
export type { HistoryEntrySummary, HistoryStateSnapshot } from "./history/EditorHistory";


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
  | { type: "group"; layerIds: string[]; name?: string }
  | { type: "mask"; action: LayerMaskAction; layerId: string }
  | {
      type: "move-to-position";
      layerIds: string[];
      targetLayerId: string;
      placement: LayerStackPlacement;
    }
  | { type: "move-down"; layerId: string }
  | { type: "move-up"; layerId: string }
  | { type: "remove-from-group"; layerIds: string[] }
  | { type: "select"; layerId: string }
  | { type: "update"; layerId: string; updates: LayerUpdate };

export type SelectionCommand = "clear" | "convert-to-mask" | "invert";

type EditorAppStateSnapshot = {
  scene: SceneSnapshot;
  textEditingState: TextEditingState;
};

type HistoryComparisonMode = "full" | "scene" | "scene-ignore-selection";

type PendingHistoryGesture = {
  action: SharedEditorAction;
  before: EditorAppStateSnapshot;
  compareMode: HistoryComparisonMode;
};

/**
 * Coordinates the active scene, renderer, tool input, and document-level editor workflows.
 */
export class EditorApp {
  private readonly renderer: Renderer;
  private scene: Scene;
  private readonly camera: Camera2D;
  private readonly inputController: InputController;
  private readonly onCameraChange?: (camera: CameraSnapshot) => void;
  private readonly onHistoryChange?: (history: HistoryStateSnapshot) => void;
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
  private readonly histories = new Map<string, EditorHistory<EditorAppStateSnapshot>>();
  private pendingHistoryGesture: PendingHistoryGesture | null = null;

  /**
   * Creates the app coordinator and initializes the shared renderer.
   */
  static async create(
    canvas: HTMLCanvasElement,
    callbacks: {
      onCameraChange?: (camera: CameraSnapshot) => void;
      onHistoryChange?: (history: HistoryStateSnapshot) => void;
      onStrokeLayerCreated?: (layerId: string) => void;
    } = {}
  ) {
    return new EditorApp(canvas, await Renderer.create(canvas), callbacks);
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    renderer: Renderer,
    callbacks: {
      onCameraChange?: (camera: CameraSnapshot) => void;
      onHistoryChange?: (history: HistoryStateSnapshot) => void;
      onStrokeLayerCreated?: (layerId: string) => void;
    } = {}
  ) {
    this.renderer = renderer;
    this.onCameraChange = callbacks.onCameraChange;
    this.onHistoryChange = callbacks.onHistoryChange;
    this.scene = new Scene({ createDefaultLayer: false });
    this.camera = new Camera2D();
    this.camera.setBounds(this.scene.document);
    this.inputController = new InputController(
      canvas,
      this.scene,
      this.camera,
      callbacks.onStrokeLayerCreated
    );
    this.notifyHistoryChange();
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
    this.resetCurrentHistory("New document");

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
    this.resetCurrentHistory("Opened image");

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

    if (this.activeDocumentId) {
      this.tabScenes.set(this.activeDocumentId, this.scene);
    }

    return this.scene;
  }

  /**
   * Switches the active document tab, creating a blank scene when needed.
   */
  switchDocument(document: { height: number; id: string; width: number }) {
    const hadScene = this.tabScenes.has(document.id);
    const result = switchEditorDocument({
      activeDocumentId: this.activeDocumentId,
      currentScene: this.scene,
      document,
      replaceScene: this.replaceScene.bind(this),
      tabScenes: this.tabScenes
    });
    this.activeDocumentId = result.activeDocumentId;
    this.ensureHistoryForDocument(
      document.id,
      hadScene ? "Current document" : "New document"
    );
    this.notifyHistoryChange();

    return this.scene;
  }

  rememberDocument(documentId: string) {
    this.activeDocumentId = rememberEditorDocument(this.tabScenes, documentId, this.scene);
    this.ensureHistoryForDocument(documentId, "Current document");
    this.notifyHistoryChange();
  }

  forgetDocument(documentId: string) {
    this.activeDocumentId = forgetEditorDocument({
      activeDocumentId: this.activeDocumentId,
      currentScene: this.scene,
      documentId,
      tabScenes: this.tabScenes
    });
    this.histories.delete(documentId);
    this.notifyHistoryChange();
  }

  /**
   * Exports the active scene as a native project package.
   */
  async exportProjectFile() {
    return exportScenePackage(this.scene);
  }

  async exportProjectTemplateFile(templateName: string) {
    return exportScenePackage(this.scene, {
      isTemplate: true,
      name: templateName.trim() || "Untitled template",
      savedAt: new Date().toISOString(),
      version: 1
    });
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
    this.resetCurrentHistory("Opened project");

    return this.scene;
  }

  async importTemplateAsGroup(file: File, templateName: string) {
    const before = this.captureAppSnapshot();
    const templateScene = await importScenePackage(file);
    const group = this.scene.insertSceneAsGroup(templateScene, templateName);

    this.recordHistoryAction(
      this.createHistoryAction({
        kind: "scene",
        label: `Insert ${group.name}`,
        operation: "insert-template-group",
        payload: {
          templateName: group.name
        }
      }),
      before,
      "scene"
    );

    return group;
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

  selectLayers(layerIds: string[]) {
    return this.scene.selectLayers(layerIds);
  }

  getSelectedLayerId() {
    return this.scene.selectedLayerIds.length > 1 ? null : this.scene.selectedLayerId;
  }

  getSelectedLayerIds() {
    return [...this.scene.selectedLayerIds];
  }

  hasActiveTextEdit() {
    return Boolean(
      this.textEditLayerId && this.scene.getLayer(this.textEditLayerId) instanceof TextLayer
    );
  }

  nudgeSelectedLayer(dx: number, dy: number) {
    if (dx === 0 && dy === 0) {
      return false;
    }

    if (this.scene.selectedLayerIds.length > 1) {
      return false;
    }

    const layer = this.scene.selectedLayerId
      ? this.scene.getLayer(this.scene.selectedLayerId)
      : null;

    if (!layer || layer.locked || this.hasActiveTextEdit()) {
      return false;
    }

    const before = this.captureAppSnapshot();
    const nextX = layer.x + dx;
    const nextY = layer.y + dy;
    const result = this.scene.updateLayer(layer.id, {
      x: nextX,
      y: nextY
    });

    if (!result) {
      return false;
    }

    this.recordHistoryAction(
      this.createHistoryAction({
        kind: "command",
        label: `Nudge ${layer.name}`,
        mergeKey: `layer-nudge:${layer.id}`,
        payload: {
          dx,
          dy,
          layerId: layer.id,
          type: "nudge"
        },
        scope: "layer"
      }),
      before,
      "scene-ignore-selection"
    );

    return true;
  }

  /**
   * Applies a layer command against the active scene.
   */
  applyLayerCommand(command: LayerCommand) {
    if (command.type === "select") {
      return applyLayerCommandToScene(this.scene, command);
    }

    const before = this.captureAppSnapshot();
    const action = this.createHistoryAction({
      kind: "command",
      label: getLayerCommandLabel(this.scene, command),
      mergeKey: getLayerCommandMergeKey(command),
      payload: command,
      scope: "layer"
    });
    const result = applyLayerCommandToScene(this.scene, command);

    this.recordHistoryAction(action, before, "scene");

    return result;
  }

  /**
   * Applies a document command and keeps camera bounds in sync.
   */
  applyDocumentCommand(command: DocumentCommand) {
    const before = this.captureAppSnapshot();
    const action = this.createHistoryAction({
      kind: "command",
      label: "Resize canvas",
      payload: command,
      scope: "document"
    });
    const result = applyDocumentCommandToScene(this.scene, command, (document) => {
      this.camera.setBounds(document);
      this.notifyCameraChange();
    });

    this.recordHistoryAction(action, before, "scene");

    return result;
  }

  /**
   * Applies an image-layer command against the active scene.
   */
  async applyImageLayerCommand(command: ImageLayerCommand) {
    const before = this.captureAppSnapshot();
    const action = this.createHistoryAction({
      kind: "command",
      label: getImageLayerCommandLabel(this.scene, command),
      payload: command,
      scope: "image-layer"
    });
    const result = await applyImageLayerCommandToScene(command, {
      resampleImageLayer: this.resampleImageLayer.bind(this),
      restoreOriginalImageLayer: this.restoreOriginalImageLayer.bind(this)
    });

    this.recordHistoryAction(action, before, "scene");

    return result;
  }

  /**
   * Applies a selection command against the active scene selection.
   */
  applySelectionCommand(command: SelectionCommand) {
    const before = this.captureAppSnapshot();
    const action = this.createHistoryAction({
      kind: "command",
      label: getSelectionCommandLabel(command),
      payload: command,
      scope: "selection"
    });
    const result = applySelectionCommandToScene(this.scene, command);

    this.recordHistoryAction(action, before, "scene");

    return result;
  }

  getHistoryState() {
    return this.getCurrentHistory()?.getState() ?? createEmptyHistoryState();
  }

  undo() {
    const snapshot = this.getCurrentHistory()?.undo();

    if (!snapshot) {
      return false;
    }

    this.pendingHistoryGesture = null;
    this.restoreAppSnapshot(snapshot);
    this.notifyHistoryChange();

    return true;
  }

  redo() {
    const snapshot = this.getCurrentHistory()?.redo();

    if (!snapshot) {
      return false;
    }

    this.pendingHistoryGesture = null;
    this.restoreAppSnapshot(snapshot);
    this.notifyHistoryChange();

    return true;
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
    const historyConfig = getGestureHistoryConfig(this.selectedTool);
    const before = historyConfig ? this.captureAppSnapshot() : null;
    const didHandle = this.inputController.pointerDown(event);

    if (didHandle && before && historyConfig) {
      this.pendingHistoryGesture = {
        action: this.createHistoryAction({
          kind: "gesture",
          label: historyConfig.label,
          payload: {
            tool: this.selectedTool
          },
          tool: this.selectedTool
        }),
        before,
        compareMode: historyConfig.compareMode
      };
    } else if (!didHandle) {
      this.pendingHistoryGesture = null;
    }

    return didHandle;
  }

  pointerMove(event: ToolPointerEvent) {
    return this.inputController.pointerMove(event);
  }

  pointerUp() {
    const didHandle = this.inputController.pointerUp();

    if (!didHandle) {
      this.pendingHistoryGesture = null;
      return false;
    }

    if (this.pendingHistoryGesture) {
      this.recordHistoryAction(
        this.pendingHistoryGesture.action,
        this.pendingHistoryGesture.before,
        this.pendingHistoryGesture.compareMode
      );
      this.pendingHistoryGesture = null;
    }

    return true;
  }

  cancelInput() {
    this.pendingHistoryGesture = null;
    this.inputController.cancel();
  }

  undoLastMaskStroke() {
    return this.inputController.undoLastMaskStroke();
  }

  getCursor(clientX: number, clientY: number) {
    return this.inputController.getCursor(clientX, clientY);
  }

  startTextEditAtClientPoint(clientX: number, clientY: number) {
    const before = this.captureAppSnapshot();
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
    this.recordHistoryAction(
      this.createHistoryAction({
        kind: "scene",
        label: "Add text layer",
        operation: "add-text-layer",
        payload: {
          tool: "Text"
        }
      }),
      before,
      "scene"
    );

    return result;
  }

  startTextSelectionAtClientPoint(clientX: number, clientY: number) {
    const before = this.captureAppSnapshot();
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
    this.recordHistoryAction(
      this.createHistoryAction({
        kind: "scene",
        label: "Add text layer",
        operation: "add-text-layer",
        payload: {
          tool: "Text"
        }
      }),
      before,
      "scene"
    );

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
    const before = this.captureAppSnapshot();
    const state = this.textEditingState;
    const result = insertTextInputState(this.scene, state, text);
    this.textEditingState = state;

    if (result) {
      this.recordHistoryAction(
        this.createHistoryAction({
          kind: "text",
          label: "Edit text",
          mergeKey: state.layerId ? `text:${state.layerId}:insert` : undefined,
          operation: "insert",
          payload: {
            layerId: state.layerId,
            text
          }
        }),
        before,
        "full"
      );
    }

    return result;
  }

  deleteTextBackward() {
    const before = this.captureAppSnapshot();
    const state = this.textEditingState;
    const result = deleteTextBackwardState(this.scene, state);
    this.textEditingState = state;

    if (result) {
      this.recordHistoryAction(
        this.createHistoryAction({
          kind: "text",
          label: "Edit text",
          mergeKey: state.layerId ? `text:${state.layerId}:delete-backward` : undefined,
          operation: "delete-backward",
          payload: {
            layerId: state.layerId
          }
        }),
        before,
        "full"
      );
    }

    return result;
  }

  deleteTextForward() {
    const before = this.captureAppSnapshot();
    const state = this.textEditingState;
    const result = deleteTextForwardState(this.scene, state);
    this.textEditingState = state;

    if (result) {
      this.recordHistoryAction(
        this.createHistoryAction({
          kind: "text",
          label: "Edit text",
          mergeKey: state.layerId ? `text:${state.layerId}:delete-forward` : undefined,
          operation: "delete-forward",
          payload: {
            layerId: state.layerId
          }
        }),
        before,
        "full"
      );
    }

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
    const before = this.captureAppSnapshot();
    const result = await addImageFileToScene(this.scene, file);

    this.recordHistoryAction(
      this.createHistoryAction({
        kind: "scene",
        label: "Import image layer",
        operation: "import-image-layer",
        payload: {
          filename: file.name
        }
      }),
      before,
      "scene"
    );

    return result;
  }

  private async resampleImageLayer(layerId: string, width: number, height: number) {
    return resampleImageLayerInScene(this.scene, layerId, width, height);
  }

  private restoreOriginalImageLayer(layerId: string) {
    return restoreOriginalImageLayerInScene(this.scene, layerId);
  }

  private getCurrentHistory() {
    return this.activeDocumentId ? this.histories.get(this.activeDocumentId) ?? null : null;
  }

  private ensureHistoryForDocument(documentId: string, initialLabel: string) {
    if (this.histories.has(documentId)) {
      return this.histories.get(documentId) ?? null;
    }

    const history = new EditorHistory(this.captureAppSnapshot(), {
      cloneSnapshot: this.cloneAppSnapshot.bind(this),
      initialLabel
    });

    this.histories.set(documentId, history);

    return history;
  }

  private resetCurrentHistory(initialLabel: string) {
    if (!this.activeDocumentId) {
      return;
    }

    const snapshot = this.captureAppSnapshot();
    const history = this.histories.get(this.activeDocumentId);

    if (history) {
      history.reset(snapshot, initialLabel);
    } else {
      this.histories.set(
        this.activeDocumentId,
        new EditorHistory(snapshot, {
          cloneSnapshot: this.cloneAppSnapshot.bind(this),
          initialLabel
        })
      );
    }

    this.notifyHistoryChange();
  }

  private captureAppSnapshot(): EditorAppStateSnapshot {
    return {
      scene: captureSceneSnapshot(this.scene),
      textEditingState: cloneTextEditingState(this.textEditingState)
    };
  }

  private cloneAppSnapshot(snapshot: EditorAppStateSnapshot): EditorAppStateSnapshot {
    return {
      scene: cloneSceneSnapshot(snapshot.scene),
      textEditingState: cloneTextEditingState(snapshot.textEditingState)
    };
  }

  private restoreAppSnapshot(snapshot: EditorAppStateSnapshot) {
    restoreSceneSnapshot(this.scene, snapshot.scene);
    this.textEditingState = cloneTextEditingState(snapshot.textEditingState);
    this.camera.setBounds(this.scene.document);

    if (this.activeDocumentId) {
      this.tabScenes.set(this.activeDocumentId, this.scene);
    }

    this.notifyCameraChange();
  }

  private recordHistoryAction(
    action: SharedEditorAction,
    before: EditorAppStateSnapshot,
    compareMode: HistoryComparisonMode
  ) {
    const history = this.getCurrentHistory();

    if (!history) {
      return;
    }

    const after = this.captureAppSnapshot();

    if (!didHistoryStateChange(before, after, compareMode)) {
      return;
    }

    history.record(action, before, after);
    this.notifyHistoryChange();
  }

  private createHistoryAction(
    action: SharedEditorActionDraft
  ): SharedEditorAction {
    return {
      ...action,
      id: crypto.randomUUID(),
      origin: "local",
      timestamp: Date.now()
    } as SharedEditorAction;
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

  private notifyHistoryChange() {
    this.onHistoryChange?.(this.getHistoryState());
  }

  addTextLayer() {
    const before = this.captureAppSnapshot();
    const layer = createDefaultTextLayer();

    this.scene.addLayer(layer);
    this.recordHistoryAction(
      this.createHistoryAction({
        kind: "scene",
        label: "Add text layer",
        operation: "add-text-layer"
      }),
      before,
      "scene"
    );

    return layer;
  }
}

function shouldShowSelectionOutline(tool: string) {
  return tool === "Move" || tool === "Text";
}

function cloneTextEditingState(state: TextEditingState): TextEditingState {
  return {
    caretIndex: state.caretIndex,
    layerId: state.layerId,
    selectionEnd: state.selectionEnd,
    selectionStart: state.selectionStart
  };
}

function createEmptyHistoryState(): HistoryStateSnapshot {
  return {
    canRedo: false,
    canUndo: false,
    entries: [],
    redoLabel: null,
    undoLabel: null
  };
}

function didHistoryStateChange(
  before: EditorAppStateSnapshot,
  after: EditorAppStateSnapshot,
  compareMode: HistoryComparisonMode
) {
  if (compareMode === "scene-ignore-selection") {
    return !areSceneSnapshotsEqual(before.scene, after.scene, {
      includeSelectedLayerId: false,
      includeSelection: false
    });
  }

  if (compareMode === "scene") {
    return !areSceneSnapshotsEqual(before.scene, after.scene);
  }

  return (
    !areSceneSnapshotsEqual(before.scene, after.scene) ||
    before.textEditingState.caretIndex !== after.textEditingState.caretIndex ||
    before.textEditingState.layerId !== after.textEditingState.layerId ||
    before.textEditingState.selectionStart !== after.textEditingState.selectionStart ||
    before.textEditingState.selectionEnd !== after.textEditingState.selectionEnd
  );
}

function getGestureHistoryConfig(tool: string) {
  if (tool === "Move") {
    return {
      compareMode: "scene-ignore-selection" as const,
      label: "Transform layer"
    };
  }

  if (tool === "Draw") {
    return {
      compareMode: "scene" as const,
      label: "Draw stroke"
    };
  }

  if (tool === "Mask Brush") {
    return {
      compareMode: "scene" as const,
      label: "Paint mask"
    };
  }

  if (tool === "Shape") {
    return {
      compareMode: "scene" as const,
      label: "Create shape"
    };
  }

  if (tool === "Rectangle Select" || tool === "Ellipse Select" || tool === "Marquee") {
    return {
      compareMode: "scene" as const,
      label: "Update selection"
    };
  }

  return null;
}

function getLayerCommandLabel(scene: Scene, command: LayerCommand) {
  const layerName = "layerId" in command ? getLayerName(scene, command.layerId) : "Layer";

  switch (command.type) {
    case "add-adjustment":
      return "Add adjustment layer";
    case "delete":
      return `Delete ${layerName}`;
    case "duplicate":
      return `Duplicate ${layerName}`;
    case "group":
      return "Group layers";
    case "mask":
      return getMaskActionLabel(layerName, command.action);
    case "move-to-position":
      return "Move layers";
    case "move-down":
    case "move-up":
      return `Reorder ${layerName}`;
    case "remove-from-group":
      return "Remove from group";
    case "select":
      return `Select ${layerName}`;
    case "update":
      return `Update ${layerName}`;
  }
}

function getLayerCommandMergeKey(command: LayerCommand) {
  if (command.type !== "update") {
    return undefined;
  }

  return `layer-update:${command.layerId}:${Object.keys(command.updates).sort().join(",")}`;
}

function getImageLayerCommandLabel(scene: Scene, command: ImageLayerCommand) {
  const layerName = getLayerName(scene, command.layerId);

  return command.type === "resample" ? `Resample ${layerName}` : `Restore ${layerName}`;
}

function getSelectionCommandLabel(command: SelectionCommand) {
  if (command === "clear") {
    return "Clear selection";
  }

  if (command === "invert") {
    return "Invert selection";
  }

  return "Convert selection to mask";
}

function getMaskActionLabel(layerName: string, action: LayerMaskAction) {
  switch (action) {
    case "add":
      return `Add mask to ${layerName}`;
    case "clear-black":
      return `Fill ${layerName} mask with black`;
    case "clear-white":
      return `Fill ${layerName} mask with white`;
    case "delete":
      return `Delete ${layerName} mask`;
    case "disable":
      return `Disable ${layerName} mask`;
    case "enable":
      return `Enable ${layerName} mask`;
    case "invert":
      return `Invert ${layerName} mask`;
    case "toggle-enabled":
      return `Toggle ${layerName} mask`;
  }
}

function getLayerName(scene: Scene, layerId: string) {
  return scene.getLayer(layerId)?.name ?? "Layer";
}
