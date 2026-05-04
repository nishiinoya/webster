import { editorRenderOptions, imageExportRenderOptions, Renderer } from "../rendering/Renderer";
import { InputController } from "../tools/input/InputController";
import type { MaskBrushOptions } from "../tools/mask-brush/MaskBrushTypes";
import type { DrawingToolOptions } from "../tools/drawing/DrawingTool";
import type { ToolPointerEvent } from "../tools/move/MoveTool";
import { Camera2D } from "../geometry/Camera2D";
import { getLayerCorners, getModelMatrix } from "../geometry/TransformGeometry";
import { invert3x3, transformPoint3x3 } from "../geometry/Matrix3";
import type { Imported3DModel } from "../import3d/Imported3DModel";
import { summarizeImported3DModel } from "../import3d/Imported3DModel";
import { import3DModelPackage } from "../import3d/import3DModel";
import { Scene } from "../scene/Scene";
import type { SceneSnapshot } from "../scene/sceneSnapshots";
import {
  areSceneSnapshotsEqual,
  captureSceneSnapshot,
  cloneSceneSnapshot,
  restoreSceneSnapshot
} from "../scene/sceneSnapshots";
import type { DocumentResizeAnchor, LayerMaskAction, LayerStackPlacement } from "../scene/Scene";
import type { LayerClipboardSnapshot } from "../scene/Scene";
import { exportScenePackage, importScenePackage } from "../projects/ProjectPackage";
import { ImageLayer } from "../layers/ImageLayer";
import { Object3DLayer } from "../layers/Object3DLayer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { TextLayer } from "../layers/TextLayer";
import type { ShapeKind } from "../layers/ShapeLayer";
import { normalizeLayerTexture } from "../layers/Layer";
import type { ImportedLayerTexture, Layer, Object3DKind } from "../layers/Layer";
import type { SelectionMode } from "../selection/SelectionManager";
import { getSelectionAlpha } from "../selection/SelectionManager";
import type { Selection, SelectionBounds } from "../selection/SelectionManager";
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
import { loadImageElement, loadImageElementFromBlob } from "./image/imageFileUtils";
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
  | { objectKind?: Object3DKind; type: "add-object3d" }
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

export type LayerAssetCommand =
  | { type: "clear-3d-material-texture"; layerId: string }
  | { type: "clear-shape-texture"; layerId: string }
  | { type: "create-3d-model-layer"; files: File[] }
  | { type: "create-loaded-3d-model-layer"; model: Imported3DModel }
  | { type: "import-3d-material-texture"; file: File; layerId: string }
  | { type: "import-3d-model"; files: File[]; layerId: string }
  | { type: "replace-loaded-3d-model"; layerId: string; model: Imported3DModel }
  | { type: "import-shape-texture"; file: File; layerId: string };

export type SelectionCommand =
  | "clear"
  | "convert-to-mask"
  | "invert"
  | { amount: number; type: "grow" }
  | { amount: number; type: "shrink" }
  | { name: string; type: "load"; mode?: SelectionMode }
  | { name: string; type: "save" }
  | { radius: number; type: "feather" };

export type EditorClipboardCommand = "copy" | "cut" | "paste";

export type EditorClipboardCommandResult = {
  didChangeScene: boolean;
  didHandle: boolean;
};

type EditorAppStateSnapshot = {
  scene: SceneSnapshot;
  textEditingState: TextEditingState;
};

type ImageClipboardSnapshot = {
  blob: Blob;
  height: number;
  name: string;
  width: number;
  x: number | null;
  y: number | null;
};

type EditorClipboardData =
  | {
      marker: string;
      kind: "image";
      image: ImageClipboardSnapshot;
    }
  | {
      marker: string;
      kind: "layers";
      layers: LayerClipboardSnapshot;
    };

let editorClipboardData: EditorClipboardData | null = null;
const websterClipboardMarkerPrefix = "webster-clipboard:";

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
        showImageWarpControls: this.selectedTool === "Transform",
        showRotationHandle: this.selectedTool === "Transform",
        showSelectionOutline: shouldShowSelectionOutline(this.selectedTool),
        showTransformHandles: this.selectedTool === "Transform" || this.selectedTool === "Crop",
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
    this.replaceScene(createBlankDocumentScene(width, height), {
      rememberActiveDocument: true
    });
    this.resetCurrentHistory("New document");

    return this.scene;
  }

  /**
   * Replaces the current scene with a document created from an imported image file.
   */
  async createImageDocument(file: File) {
    const scene = await createImageDocumentFromFile(file);

    this.replaceScene(scene, {
      rememberActiveDocument: true
    });
    this.camera.fitBounds(scene.document);
    this.notifyCameraChange();
    this.resetCurrentHistory("Opened image");

    return scene;
  }

  /**
   * Swaps the active scene and rebinds camera and input systems to it.
   */
  replaceScene(
    nextScene: Scene,
    options: {
      disposeCurrent?: boolean;
      rememberActiveDocument?: boolean;
    } = {}
  ) {
    this.scene = replaceEditorScene({
      camera: this.camera,
      currentScene: this.scene,
      disposeCurrent: options.disposeCurrent,
      inputController: this.inputController,
      nextScene,
      notifyCameraChange: this.notifyCameraChange.bind(this)
    });

    const shouldRemember = options.rememberActiveDocument ?? true;

    if (shouldRemember && this.activeDocumentId) {
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
    this.replaceScene(nextScene, {
      rememberActiveDocument: true
    });
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

  setSelectionMode(mode: SelectionMode) {
    this.inputController.setSelectionMode(mode);
  }

  setMagicSelectionTolerance(tolerance: number) {
    this.inputController.setMagicSelectionTolerance(tolerance);
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

  async copySelectedContent(): Promise<EditorClipboardCommandResult> {
    if (this.hasActiveTextEdit()) {
      return { didChangeScene: false, didHandle: false };
    }

    const hasSelection = Boolean(this.scene.selection.current);
    const imageClipboard = await this.createSelectedPixelClipboardSnapshot();

    if (imageClipboard) {
      const marker = createClipboardMarker("image");

      editorClipboardData = {
        image: imageClipboard,
        kind: "image",
        marker
      };
      await writeImageBlobToSystemClipboard(imageClipboard.blob, marker);

      return { didChangeScene: false, didHandle: true };
    }

    if (hasSelection) {
      return { didChangeScene: false, didHandle: false };
    }

    const layerClipboard = this.scene.createLayerClipboardSnapshot();

    if (!layerClipboard) {
      return { didChangeScene: false, didHandle: false };
    }

    const marker = createClipboardMarker("layers");

    editorClipboardData = {
      kind: "layers",
      layers: layerClipboard,
      marker
    };
    await writeClipboardTextMarker(marker);

    return { didChangeScene: false, didHandle: true };
  }

  async cutSelectedContent(): Promise<EditorClipboardCommandResult> {
    if (this.hasActiveTextEdit()) {
      return { didChangeScene: false, didHandle: false };
    }

    const selectedImageLayer = this.getSelectedImageLayer();

    if (this.scene.selection.current && selectedImageLayer && !selectedImageLayer.locked) {
      const imageClipboard = await this.createSelectedPixelClipboardSnapshot();

      if (!imageClipboard) {
        return { didChangeScene: false, didHandle: false };
      }

      const before = this.captureAppSnapshot();
      const didClearPixels = await clearSelectedImageLayerPixels(
        selectedImageLayer,
        this.scene.selection.current
      );

      if (!didClearPixels) {
        return { didChangeScene: false, didHandle: false };
      }

      const marker = createClipboardMarker("image");

      editorClipboardData = {
        image: imageClipboard,
        kind: "image",
        marker
      };
      await writeImageBlobToSystemClipboard(imageClipboard.blob, marker);
      this.recordHistoryAction(
        this.createHistoryAction({
          kind: "scene",
          label: `Cut pixels from ${selectedImageLayer.name}`,
          operation: "cut-selected-pixels",
          payload: {
            layerId: selectedImageLayer.id
          }
        }),
        before,
        "scene"
      );

      return { didChangeScene: true, didHandle: true };
    }

    const layerClipboard = this.scene.createLayerClipboardSnapshot();

    if (!layerClipboard) {
      return { didChangeScene: false, didHandle: false };
    }

    const before = this.captureAppSnapshot();
    const removedLayers = this.scene.removeLayersById(layerClipboard.rootLayerIds);

    if (!removedLayers) {
      return { didChangeScene: false, didHandle: false };
    }

    const marker = createClipboardMarker("layers");

    editorClipboardData = {
      kind: "layers",
      layers: layerClipboard,
      marker
    };
    await writeClipboardTextMarker(marker);
    this.recordHistoryAction(
      this.createHistoryAction({
        kind: "scene",
        label: layerClipboard.rootLayerIds.length > 1 ? "Cut layers" : "Cut layer",
        operation: "cut-layers",
        payload: {
          layerIds: layerClipboard.rootLayerIds
        }
      }),
      before,
      "scene"
    );

    return { didChangeScene: true, didHandle: true };
  }

  async pasteClipboardContent(): Promise<EditorClipboardCommandResult> {
    if (this.hasActiveTextEdit()) {
      return { didChangeScene: false, didHandle: false };
    }

    const systemClipboard = await readSystemClipboard();
    const systemClipboardStillMatchesInternal =
      Boolean(editorClipboardData) &&
      systemClipboard.canInspect &&
      systemClipboard.marker === editorClipboardData?.marker;

    if (editorClipboardData?.kind === "image" && systemClipboardStillMatchesInternal) {
      return {
        didChangeScene: await this.pasteImageClipboardSnapshot(
          editorClipboardData.image,
          "Paste pixels"
        ),
        didHandle: true
      };
    }

    if (systemClipboard.image) {
      return {
        didChangeScene: await this.pasteImageClipboardSnapshot(
          systemClipboard.image,
          "Paste clipboard image"
        ),
        didHandle: true
      };
    }

    if (!editorClipboardData) {
      return { didChangeScene: false, didHandle: false };
    }

    if (systemClipboard.canInspect && !systemClipboardStillMatchesInternal) {
      return { didChangeScene: false, didHandle: false };
    }

    if (editorClipboardData.kind === "image") {
      return {
        didChangeScene: await this.pasteImageClipboardSnapshot(
          editorClipboardData.image,
          "Paste pixels"
        ),
        didHandle: true
      };
    }

    const before = this.captureAppSnapshot();
    const pastedLayers = this.scene.pasteLayerClipboardSnapshot(editorClipboardData.layers);

    if (!pastedLayers) {
      return { didChangeScene: false, didHandle: false };
    }

    this.recordHistoryAction(
      this.createHistoryAction({
        kind: "scene",
        label:
          editorClipboardData.layers.rootLayerIds.length > 1
            ? "Paste layers"
            : "Paste layer",
        operation: "paste-layers",
        payload: {
          layerIds: this.scene.selectedLayerIds
        }
      }),
      before,
      "scene"
    );

    return { didChangeScene: true, didHandle: true };
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
   * Imports texture/model assets into shape and 3D layers.
   */
  async applyLayerAssetCommand(command: LayerAssetCommand) {
    const before = this.captureAppSnapshot();
    const result = await this.applyLayerAssetCommandToScene(command);

    this.recordHistoryAction(
      this.createHistoryAction({
        kind: "command",
        label: getLayerAssetCommandLabel(this.scene, command),
        payload: getLayerAssetCommandPayload(command),
        scope: "layer"
      }),
      before,
      "scene"
    );

    return result;
  }

  async importDroppedFiles(files: File[], clientX: number, clientY: number) {
    const worldPoint = this.getClientWorldPoint(clientX, clientY);
    const hitLayer = this.scene.hitTestLayer(worldPoint.x, worldPoint.y);
    const assetFiles = files.filter(isSupportedDroppedAssetFile);

    if (assetFiles.length === 0) {
      throw new Error("Drop an image file, model file, material file, or .zip model package.");
    }

    if (assetFiles.some(isModelAssetFile)) {
      const before = this.captureAppSnapshot();
      const targetLayer =
        hitLayer instanceof Object3DLayer && !hitLayer.locked
          ? hitLayer
          : new Object3DLayer({
              height: 260,
              id: crypto.randomUUID(),
              name: "3D object",
              width: 260,
              x: worldPoint.x - 130,
              y: worldPoint.y - 130
            });

      if (targetLayer !== hitLayer) {
        this.scene.addLayer(targetLayer);
      }

      const result = await importModelAssetsIntoLayer(targetLayer, assetFiles);
      this.recordHistoryAction(
        this.createHistoryAction({
          kind: "scene",
          label: `Import ${targetLayer.modelName ?? "3D model"}`,
          operation: "drop-3d-model",
          payload: {
            filenames: assetFiles.map((file) => file.name),
            layerId: targetLayer.id
          }
        }),
        before,
        "scene"
      );

      return result.layer;
    }

    const imageFiles = assetFiles.filter(isImageFile);

    if (imageFiles.length === 0) {
      throw new Error("Drop an image file, model file, material file, or .zip model package.");
    }

    if (hitLayer instanceof ShapeLayer && !hitLayer.locked) {
      const before = this.captureAppSnapshot();

      await importTextureIntoShapeLayer(hitLayer, imageFiles[0]);
      this.recordHistoryAction(
        this.createHistoryAction({
          kind: "scene",
          label: `Texture ${hitLayer.name}`,
          operation: "drop-shape-texture",
          payload: {
            filename: imageFiles[0].name,
            layerId: hitLayer.id
          }
        }),
        before,
        "scene"
      );

      return hitLayer;
    }

    let lastLayer: ImageLayer | null = null;

    for (const [index, file] of imageFiles.entries()) {
      lastLayer = await this.addImageFile(file, {
        x: worldPoint.x + index * 18,
        y: worldPoint.y - index * 18
      });
    }

    return lastLayer;
  }

  async importDroppedFile(file: File, clientX: number, clientY: number) {
    return this.importDroppedFiles([file], clientX, clientY);
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

  private getSelectedImageLayer() {
    if (this.scene.selectedLayerIds.length !== 1 || !this.scene.selectedLayerId) {
      return null;
    }

    const layer = this.scene.getLayer(this.scene.selectedLayerId);

    return layer instanceof ImageLayer ? layer : null;
  }

  private async createSelectedPixelClipboardSnapshot(layer?: ImageLayer | null) {
    const selection = this.scene.selection.current;

    if (!selection) {
      return null;
    }

    if (layer) {
      return copySelectedImageLayerPixels(layer, selection);
    }

    return copySelectedScenePixels(this.scene, selection);
  }

  private async pasteImageClipboardSnapshot(
    imageClipboard: ImageClipboardSnapshot,
    label: string
  ) {
    const before = this.captureAppSnapshot();
    const image = await loadImageElementFromBlob(imageClipboard.blob);
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const maxInitialSize = 420;
    const shouldKeepDocumentPlacement = imageClipboard.x !== null && imageClipboard.y !== null;
    const scale = shouldKeepDocumentPlacement
      ? 1
      : Math.min(1, maxInitialSize / Math.max(imageWidth, imageHeight));
    const layer = new ImageLayer({
      assetId: crypto.randomUUID(),
      height: imageHeight,
      id: crypto.randomUUID(),
      image,
      mimeType: imageClipboard.blob.type || "image/png",
      name: imageClipboard.name,
      objectUrl: image.src,
      scaleX: shouldKeepDocumentPlacement ? imageClipboard.width / imageWidth : scale,
      scaleY: shouldKeepDocumentPlacement ? imageClipboard.height / imageHeight : scale,
      width: imageWidth,
      x: shouldKeepDocumentPlacement ? imageClipboard.x ?? 0 : (-imageWidth * scale) / 2,
      y: shouldKeepDocumentPlacement ? imageClipboard.y ?? 0 : (-imageHeight * scale) / 2
    });

    this.scene.addLayer(layer);
    this.recordHistoryAction(
      this.createHistoryAction({
        kind: "scene",
        label,
        operation: "paste-image-layer",
        payload: {
          layerId: layer.id
        }
      }),
      before,
      "scene"
    );

    return true;
  }

  async addImageFile(file: File, center?: { x: number; y: number }) {
    const before = this.captureAppSnapshot();
    const result = await addImageFileToScene(this.scene, file, { center });

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

  private async applyLayerAssetCommandToScene(command: LayerAssetCommand) {
    if (command.type === "create-loaded-3d-model-layer") {
      const layer = this.scene.addObject3DLayer("imported");

      layer.replaceImportedModel(command.model);
      layer.materialTextureImage = null;
      layer.materialTexture = normalizeLayerTexture({
        ...layer.materialTexture,
        blend: 0,
        kind: "none"
      });

      return {
        layer,
        ...summarizeImported3DModel(command.model)
      };
    }

    if (command.type === "create-3d-model-layer") {
      const layer = this.scene.addObject3DLayer();

      return importModelAssetsIntoLayer(layer, command.files);
    }

    const layer = this.scene.getLayer(command.layerId);

    if (command.type === "import-shape-texture") {
      if (!(layer instanceof ShapeLayer) || layer.locked) {
        return null;
      }

      return importTextureIntoShapeLayer(layer, command.file);
    }

    if (command.type === "clear-shape-texture") {
      if (!(layer instanceof ShapeLayer) || layer.locked) {
        return null;
      }

      layer.textureImage = null;
      if (layer.texture.kind === "image") {
        layer.texture = normalizeLayerTexture({ ...layer.texture, blend: 0, kind: "none" });
      }

      return layer;
    }

    if (command.type === "import-3d-material-texture") {
      if (!(layer instanceof Object3DLayer) || layer.locked) {
        return null;
      }

      return importMaterialTextureIntoObjectLayer(layer, command.file);
    }

    if (command.type === "clear-3d-material-texture") {
      if (!(layer instanceof Object3DLayer) || layer.locked) {
        return null;
      }

      layer.materialTextureImage = null;
      if (layer.materialTexture.kind === "image") {
        layer.materialTexture = normalizeLayerTexture({
          ...layer.materialTexture,
          blend: 0,
          kind: "none"
        });
      }

      return layer;
    }

    if (!(layer instanceof Object3DLayer) || layer.locked) {
      return null;
    }

    if (command.type === "replace-loaded-3d-model") {
      layer.replaceImportedModel(command.model);
      layer.materialTextureImage = null;
      layer.materialTexture = normalizeLayerTexture({
        ...layer.materialTexture,
        blend: 0,
        kind: "none"
      });

      return {
        layer,
        ...summarizeImported3DModel(command.model)
      };
    }

    return importModelAssetsIntoLayer(layer, command.files);
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

  private getClientWorldPoint(clientX: number, clientY: number) {
    const point = this.getCanvasPoint(clientX, clientY);

    return this.camera.screenToWorld(point.x, point.y);
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
  return tool === "Move" || tool === "Transform" || tool === "Text" || tool === "Crop";
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
  if (tool === "Move" || tool === "Transform" || tool === "Crop") {
    return {
      compareMode: "scene-ignore-selection" as const,
      label:
        tool === "Crop" ? "Crop layer" : tool === "Transform" ? "Transform layer" : "Move layer"
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

  if (
    tool === "Rectangle Select" ||
    tool === "Ellipse Select" ||
    tool === "Lasso Select" ||
    tool === "Magic Select" ||
    tool === "Marquee"
  ) {
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
    case "add-object3d":
      return "Add 3D object layer";
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

function getLayerAssetCommandLabel(scene: Scene, command: LayerAssetCommand) {
  const layerName = "layerId" in command ? getLayerName(scene, command.layerId) : "3D object";

  switch (command.type) {
    case "clear-3d-material-texture":
      return `Clear ${layerName} material texture`;
    case "clear-shape-texture":
      return `Clear ${layerName} texture`;
    case "create-3d-model-layer":
      return "Import 3D model";
    case "create-loaded-3d-model-layer":
      return `Add ${command.model.name}`;
    case "import-3d-material-texture":
      return `Texture ${layerName}`;
    case "import-3d-model":
      return `Import model into ${layerName}`;
    case "replace-loaded-3d-model":
      return `Replace ${layerName} model`;
    case "import-shape-texture":
      return `Texture ${layerName}`;
  }
}

function getLayerAssetCommandPayload(command: LayerAssetCommand) {
  if ("model" in command) {
    return {
      layerId: "layerId" in command ? command.layerId : null,
      modelName: command.model.name,
      sourceFormat: command.model.sourceFormat,
      type: command.type
    };
  }

  if ("files" in command) {
    return {
      filenames: command.files.map((file) => file.name),
      layerId: "layerId" in command ? command.layerId : null,
      type: command.type
    };
  }

  if ("file" in command) {
    return {
      filename: command.file.name,
      layerId: command.layerId,
      type: command.type
    };
  }

  return command;
}

function getSelectionCommandLabel(command: SelectionCommand) {
  if (typeof command !== "string") {
    if (command.type === "feather") {
      return "Feather selection";
    }

    if (command.type === "grow") {
      return "Grow selection";
    }

    if (command.type === "shrink") {
      return "Shrink selection";
    }

    if (command.type === "load") {
      return "Load selection";
    }

    return "Save selection";
  }

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

async function importTextureIntoShapeLayer(layer: ShapeLayer, file: File) {
  layer.textureImage = await createImportedLayerTexture(file);
  layer.texture = normalizeLayerTexture({
    ...layer.texture,
    blend: Math.max(layer.texture.blend, 0.85),
    kind: "image",
    scale: layer.texture.scale || 16
  });

  return layer;
}

async function importMaterialTextureIntoObjectLayer(layer: Object3DLayer, file: File) {
  layer.materialTextureImage = await createImportedLayerTexture(file);
  layer.materialTexture = normalizeLayerTexture({
    ...layer.materialTexture,
    blend: Math.max(layer.materialTexture.blend, 0.85),
    kind: "image",
    scale: layer.materialTexture.scale || 16
  });

  return layer;
}

type ModelAssetFile = {
  file: File;
  path: string;
};

type MtlMaterial = {
  diffuseColor: [number, number, number] | null;
  name: string;
  texturePath: string | null;
};

type ResolvedModelMaterial = {
  diffuseColor: [number, number, number] | null;
  material: MtlMaterial;
  textureAsset: ModelAssetFile | null;
};

type ModelMaterialResolution = {
  appliedTextureNames: string[];
  materialCount: number;
  materials: ResolvedModelMaterial[];
  textureCount: number;
  textureNames: string[];
};

async function importModelAssetsIntoLayer(layer: Object3DLayer, files: File[]) {
  const model = await import3DModelPackage(files);

  layer.replaceImportedModel(model);
  layer.materialTextureImage = null;
  layer.materialTexture = normalizeLayerTexture({
    ...layer.materialTexture,
    blend: 0,
    kind: "none"
  });

  return {
    layer,
    ...summarizeImported3DModel(model)
  };
}

async function expandModelAssetFiles(files: File[]): Promise<ModelAssetFile[]> {
  const expanded: ModelAssetFile[] = [];

  for (const file of files) {
    if (isZipFile(file)) {
      expanded.push(...(await extractZipModelAssets(file)));
      continue;
    }

    expanded.push({
      file,
      path: normalizeAssetPath(file.webkitRelativePath || file.name)
    });
  }

  return expanded.filter((asset) => isSupportedModelPackageFile(asset.file));
}

function chooseObjAsset(assets: ModelAssetFile[]) {
  return assets
    .filter((asset) => isObjFile(asset.file))
    .sort((left, right) => left.path.split("/").length - right.path.split("/").length)[0] ?? null;
}

async function resolveObjMaterials(
  objSource: string,
  objPath: string,
  assets: ModelAssetFile[]
): Promise<ModelMaterialResolution> {
  const hints = parseObjMaterialHints(objSource);
  const objDirectory = getAssetDirectory(objPath);

  const mtlAsset =
    findReferencedAsset(assets, objDirectory, hints.mtlNames, isMtlFile) ??
    findFirstAsset(assets, objDirectory, isMtlFile);

  const materials = mtlAsset ? parseMtlMaterials(await mtlAsset.file.text()) : [];
  const mtlDirectory = getAssetDirectory(mtlAsset?.path ?? objPath);

  const usedMaterialNames = new Set(
    hints.usedMaterials.map((name) => name.toLowerCase())
  );

  const relevantMaterials =
    usedMaterialNames.size > 0
      ? materials.filter((material) =>
          usedMaterialNames.has(material.name.toLowerCase())
        )
      : materials;

  const resolvedMaterials = relevantMaterials.map((material) => {
    const textureAsset = material.texturePath
      ? findReferencedAsset(assets, mtlDirectory, [material.texturePath], isImageFile)
      : null;

    return {
      diffuseColor: material.diffuseColor,
      material,
      textureAsset
    };
  });

  const textureAssets = assets.filter((asset) => isImageFile(asset.file));

  const appliedTextureNames = [
    ...new Set(
      resolvedMaterials
        .map((material) => material.textureAsset?.file.name)
        .filter((name): name is string => Boolean(name))
    )
  ];

  return {
    appliedTextureNames,
    materialCount: materials.length,
    materials: resolvedMaterials,
    textureCount: textureAssets.length,
    textureNames: textureAssets.map((asset) => asset.file.name)
  };
}

function parseObjMaterialHints(source: string) {
  const mtlNames: string[] = [];
  const usedMaterials: string[] = [];

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const [keyword] = line.split(/\s+/u);
    const lowerKeyword = keyword.toLowerCase();

    if (lowerKeyword === "mtllib") {
      const value = line.slice(keyword.length).trim();

      if (value) {
        pushAssetReferences(mtlNames, value);
      }
    } else if (lowerKeyword === "usemtl") {
      const value = line.slice(keyword.length).trim();

      if (value) {
        usedMaterials.push(stripAssetReferenceQuotes(value));
      }
    }
  }

  return { mtlNames, usedMaterials };
}

function parseMtlMaterials(source: string) {
  const materials: MtlMaterial[] = [];
  let current: MtlMaterial | null = null;

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const [keyword] = line.split(/\s+/u);
    const lowerKeyword = keyword.toLowerCase();

    if (lowerKeyword === "newmtl") {
      current = {
        diffuseColor: null,
        name: stripAssetReferenceQuotes(line.slice(keyword.length).trim()),
        texturePath: null
      };
      materials.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (lowerKeyword === "kd") {
      const channels = line.slice(keyword.length).trim().split(/\s+/u).slice(0, 3).map(Number);

      if (channels.length === 3 && channels.every(Number.isFinite)) {
        current.diffuseColor = [
          clampUnit(channels[0]),
          clampUnit(channels[1]),
          clampUnit(channels[2])
        ];
      }
      continue;
    }

    if (
      lowerKeyword === "map_kd" ||
      lowerKeyword === "map_ka" ||
      lowerKeyword === "map_basecolor"
    ) {
      current.texturePath = parseMtlTexturePath(line);
    }
  }

  return materials;
}

function chooseMtlMaterial(materials: MtlMaterial[], usedMaterials: string[]) {
  for (const usedMaterial of usedMaterials) {
    const material = materials.find(
      (candidate) => candidate.name.toLowerCase() === usedMaterial.toLowerCase()
    );

    if (material?.texturePath || material?.diffuseColor) {
      return material;
    }
  }

  return (
    materials.find((material) => material.texturePath) ??
    materials.find((material) => material.diffuseColor) ??
    null
  );
}

function parseMtlTexturePath(line: string) {
  const [, ...tokens] = line.split(/\s+/u);
  const pathTokens: string[] = [];
  const optionValueCounts: Record<string, number> = {
    "-blendu": 1,
    "-blendv": 1,
    "-bm": 1,
    "-boost": 1,
    "-cc": 1,
    "-clamp": 1,
    "-imfchan": 1,
    "-mm": 2,
    "-o": 3,
    "-s": 3,
    "-t": 3,
    "-texres": 1
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.startsWith("-")) {
      index += optionValueCounts[token] ?? 0;
      continue;
    }

    pathTokens.push(token);
  }

  return stripAssetReferenceQuotes(pathTokens.join(" ").trim() || (tokens.at(-1) ?? ""));
}

function findReferencedAsset(
  assets: ModelAssetFile[],
  baseDirectory: string,
  references: string[],
  predicate: (file: File) => boolean
) {
  for (const reference of references) {
    const cleanReference = stripAssetReferenceQuotes(reference);
    if (!cleanReference) {
      continue;
    }

    const resolvedPath = normalizeAssetPath(`${baseDirectory}/${cleanReference}`);
    const normalizedReference = normalizeAssetPath(cleanReference);
    const referenceName = getAssetBasename(normalizedReference);
    const exact = assets.find(
      (asset) =>
        predicate(asset.file) &&
        normalizeAssetPath(asset.path).toLowerCase() === resolvedPath.toLowerCase()
    );

    if (exact) {
      return exact;
    }

    const loose = assets.find(
      (asset) =>
        predicate(asset.file) &&
        (normalizeAssetPath(asset.path).toLowerCase().endsWith(`/${normalizedReference}`.toLowerCase()) ||
          getAssetBasename(asset.path).toLowerCase() === referenceName.toLowerCase())
    );

    if (loose) {
      return loose;
    }
  }

  return null;
}

function findFirstAsset(
  assets: ModelAssetFile[],
  preferredDirectory: string,
  predicate: (file: File) => boolean
) {
  const candidates = assets.filter((asset) => predicate(asset.file));

  return (
    candidates.find((asset) => getAssetDirectory(asset.path) === preferredDirectory) ??
    candidates[0] ??
    null
  );
}

function findFirstImageAsset(assets: ModelAssetFile[], preferredDirectory: string) {
  return findFirstAsset(assets, preferredDirectory, isImageFile);
}

function pushAssetReferences(references: string[], value: string) {
  const cleanValue = stripAssetReferenceQuotes(value);

  if (cleanValue) {
    references.push(cleanValue);
  }

  for (const token of value.split(/\s+/u)) {
    const cleanToken = stripAssetReferenceQuotes(token);

    if (cleanToken && !references.includes(cleanToken)) {
      references.push(cleanToken);
    }
  }
}

function stripAssetReferenceQuotes(reference: string) {
  return reference.trim().replace(/^["']|["']$/gu, "");
}

async function createImportedLayerTexture(file: File): Promise<ImportedLayerTexture> {
  if (!isImageFile(file)) {
    throw new Error("Choose an image file for the texture.");
  }

  const [dataUrl, image] = await Promise.all([fileToDataUrl(file), loadImageElement(file)]);

  return {
    dataUrl,
    height: image.naturalHeight || image.height,
    id: crypto.randomUUID(),
    image,
    mimeType: file.type || "image/png",
    name: file.name || "Texture",
    width: image.naturalWidth || image.width
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read texture file."));
    };
    reader.onerror = () => reject(new Error("Unable to read texture file."));
    reader.readAsDataURL(file);
  });
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/iu.test(file.name);
}

function isMtlFile(file: File) {
  return /\.mtl$/iu.test(file.name);
}

function isObjFile(file: File) {
  return /\.obj$/iu.test(file.name);
}

function isZipFile(file: File) {
  return file.type === "application/zip" || /\.zip$/iu.test(file.name);
}

function isModelAssetFile(file: File) {
  return /\.(obj|mtl|zip|glb|gltf|bin|stl|ply|fbx|dae|3ds)$/iu.test(file.name) || isZipFile(file);
}

function isSupportedDroppedAssetFile(file: File) {
  return isImageFile(file) || isSupportedModelPackageFile(file);
}

function isSupportedModelPackageFile(file: File) {
  return (
    /\.(obj|mtl|zip|glb|gltf|bin|stl|ply|fbx|dae|3ds)$/iu.test(file.name) ||
    isZipFile(file) ||
    isImageFile(file)
  );
}

async function extractZipModelAssets(file: File): Promise<ModelAssetFile[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);

  if (eocdOffset < 0) {
    throw new Error(`Unable to read ${file.name}. The zip directory was not found.`);
  }

  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const entries: ModelAssetFile[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      break;
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const path = normalizeAssetPath(
      decodeZipString(bytes.subarray(offset + 46, offset + 46 + fileNameLength))
    );

    offset += 46 + fileNameLength + extraLength + commentLength;

    if (!path || path.endsWith("/")) {
      continue;
    }

    const fileName = getAssetBasename(path);

    if (!isSupportedModelPackageName(fileName)) {
      continue;
    }

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const data = await inflateZipEntry(compressed, compressionMethod);
    const extractedFile = new File([copyBytesToArrayBuffer(data)], fileName, {
      type: getMimeTypeFromFilename(fileName)
    });

    entries.push({ file: extractedFile, path });
  }

  return entries;
}

function findEndOfCentralDirectory(view: DataView) {
  const minimumOffset = Math.max(0, view.byteLength - 66_000);

  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  return -1;
}

async function inflateZipEntry(bytes: Uint8Array, compressionMethod: number) {
  if (compressionMethod === 0) {
    return bytes;
  }

  if (compressionMethod !== 8 || typeof DecompressionStream === "undefined") {
    throw new Error("This zip uses a compression method the browser cannot read.");
  }

  const stream = new Blob([copyBytesToArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();

  return new Uint8Array(buffer);
}

function copyBytesToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);

  return copy.buffer;
}

function decodeZipString(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes);
}

function normalizeAssetPath(path: string) {
  const parts: string[] = [];

  for (const part of path.replace(/\\/gu, "/").replace(/^\/+/u, "").split("/")) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return parts.join("/");
}

function getAssetDirectory(path: string) {
  const normalizedPath = normalizeAssetPath(path);
  const slashIndex = normalizedPath.lastIndexOf("/");

  return slashIndex >= 0 ? normalizedPath.slice(0, slashIndex) : "";
}

function getAssetBasename(path: string) {
  return normalizeAssetPath(path).split("/").pop() || path;
}

function isSupportedModelPackageName(name: string) {
  return /\.(obj|mtl|glb|gltf|bin|stl|ply|fbx|dae|3ds|png|jpe?g|gif|webp|bmp|svg)$/iu.test(name);
}

function getMimeTypeFromFilename(name: string) {
  const lowerName = name.toLowerCase();

  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lowerName.endsWith(".png")) {
    return "image/png";
  }

  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }

  if (lowerName.endsWith(".gif")) {
    return "image/gif";
  }

  if (lowerName.endsWith(".bmp")) {
    return "image/bmp";
  }

  if (lowerName.endsWith(".svg")) {
    return "image/svg+xml";
  }

  return "text/plain";
}

function clampUnit(value: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
}

async function copySelectedScenePixels(
  scene: Scene,
  selection: Selection
): Promise<ImageClipboardSnapshot | null> {
  const bounds = getSelectedSceneCopyBounds(scene, selection);
  const size = getClipboardCanvasSize(bounds);
  const canvas = document.createElement("canvas");
  const renderer = await Renderer.create(canvas, {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true
  });
  const camera = new Camera2D();

  camera.setBounds(null);
  camera.x = bounds.x + bounds.width / 2;
  camera.y = bounds.y + bounds.height / 2;
  camera.zoom = Math.min(size.width / bounds.width, size.height / bounds.height);

  try {
    await renderer.prepareSceneFonts(scene);
    renderer.renderToSize(
      scene,
      camera,
      {
        ...imageExportRenderOptions,
        documentBackground: "transparent"
      },
      size.width,
      size.height
    );

    const maskedCanvas = copyCanvasTo2dCanvas(canvas);

    if (!applySelectionAlphaMask(maskedCanvas, bounds, selection)) {
      return null;
    }

    return {
      blob: await canvasToBlob(maskedCanvas, "image/png"),
      height: bounds.height,
      name: "Selection pixels.png",
      width: bounds.width,
      x: bounds.x,
      y: bounds.y
    };
  } finally {
    renderer.dispose();
    camera.dispose();
  }
}

async function copySelectedImageLayerPixels(
  layer: ImageLayer,
  selection: Selection
): Promise<ImageClipboardSnapshot | null> {
  const inverseMatrix = invert3x3(getModelMatrix(layer));

  if (!inverseMatrix) {
    return null;
  }

  const source = createImagePixelCanvas(layer.image);
  const sourceImageData = source.context.getImageData(0, 0, source.width, source.height);
  const bounds = getSelectedPixelCopyBounds(layer, selection);
  const size = getClipboardCanvasSize(bounds);
  const width = size.width;
  const height = size.height;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Unable to copy selected pixels.");
  }

  canvas.width = width;
  canvas.height = height;

  const outputImageData = context.createImageData(width, height);
  let copiedPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const worldY = bounds.y + ((y + 0.5) / height) * bounds.height;

    for (let x = 0; x < width; x += 1) {
      const worldX = bounds.x + ((x + 0.5) / width) * bounds.width;

      const selectionAlpha = getSelectionAlpha(selection, worldX, worldY);

      if (selectionAlpha <= 0) {
        continue;
      }

      const localPoint = transformPoint3x3(inverseMatrix, worldX, worldY);

      if (
        localPoint.x < 0 ||
        localPoint.x > 1 ||
        localPoint.y < 0 ||
        localPoint.y > 1
      ) {
        continue;
      }

      const sourceX = Math.min(
        source.width - 1,
        Math.max(0, Math.floor(localPoint.x * source.width))
      );
      const sourceY = Math.min(
        source.height - 1,
        Math.max(0, Math.floor((1 - localPoint.y) * source.height))
      );
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const outputIndex = (y * width + x) * 4;

      outputImageData.data[outputIndex] = sourceImageData.data[sourceIndex];
      outputImageData.data[outputIndex + 1] = sourceImageData.data[sourceIndex + 1];
      outputImageData.data[outputIndex + 2] = sourceImageData.data[sourceIndex + 2];
      outputImageData.data[outputIndex + 3] = Math.round(
        sourceImageData.data[sourceIndex + 3] * (selectionAlpha / 255)
      );
      copiedPixels += 1;
    }
  }

  if (copiedPixels === 0) {
    return null;
  }

  context.putImageData(outputImageData, 0, 0);

  return {
    blob: await canvasToBlob(canvas, "image/png"),
    height: bounds.height,
    name: `${layer.name} pixels.png`,
    width: bounds.width,
    x: bounds.x,
    y: bounds.y
  };
}

async function clearSelectedImageLayerPixels(layer: ImageLayer, selection: Selection) {
  const source = createImagePixelCanvas(layer.image);
  const imageData = source.context.getImageData(0, 0, source.width, source.height);
  const modelMatrix = getModelMatrix(layer);
  let didClear = false;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const localX = source.width <= 1 ? 0 : (x + 0.5) / source.width;
      const localY = source.height <= 1 ? 0 : 1 - (y + 0.5) / source.height;
      const worldPoint = transformPoint3x3(modelMatrix, localX, localY);

      const selectionAlpha = getSelectionAlpha(selection, worldPoint.x, worldPoint.y);

      if (selectionAlpha <= 0) {
        continue;
      }

      const alphaIndex = (y * source.width + x) * 4 + 3;

      if (imageData.data[alphaIndex] !== 0) {
        imageData.data[alphaIndex] = Math.round(
          imageData.data[alphaIndex] * (1 - selectionAlpha / 255)
        );
        didClear = true;
      }
    }
  }

  if (!didClear) {
    return false;
  }

  source.context.putImageData(imageData, 0, 0);

  const mimeType = "image/png";
  const blob = await canvasToBlob(source.canvas, mimeType);
  const image = await loadImageElementFromBlob(blob);

  layer.replaceImage(image, image.src, {
    assetId: crypto.randomUUID(),
    mimeType: blob.type || mimeType
  });

  return true;
}

function createImagePixelCanvas(image: HTMLImageElement) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context || width <= 0 || height <= 0) {
    throw new Error("Unable to read image pixels.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return {
    canvas,
    context,
    height,
    width
  };
}

function getSelectedPixelCopyBounds(layer: Layer, selection: Selection): SelectionBounds {
  if (!selection.inverted) {
    return {
      height: Math.max(1, selection.bounds.height),
      width: Math.max(1, selection.bounds.width),
      x: selection.bounds.x,
      y: selection.bounds.y
    };
  }

  return getLayerWorldBounds(layer);
}

function getSelectedSceneCopyBounds(scene: Scene, selection: Selection): SelectionBounds {
  if (!selection.inverted) {
    return {
      height: Math.max(1, selection.bounds.height),
      width: Math.max(1, selection.bounds.width),
      x: selection.bounds.x,
      y: selection.bounds.y
    };
  }

  return {
    height: Math.max(1, scene.document.height),
    width: Math.max(1, scene.document.width),
    x: scene.document.x,
    y: scene.document.y
  };
}

function getLayerWorldBounds(layer: Layer): SelectionBounds {
  const corners = getLayerCorners(layer);
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    height: Math.max(1, maxY - minY),
    width: Math.max(1, maxX - minX),
    x: minX,
    y: minY
  };
}

function clampClipboardCanvasDimension(value: number) {
  return Math.min(Math.max(Math.round(value), 1), 12000);
}

function getClipboardCanvasSize(bounds: SelectionBounds) {
  const maxPixelArea = 16_000_000;
  const safeWidth = Math.max(bounds.width, 1);
  const safeHeight = Math.max(bounds.height, 1);
  const scale = Math.min(
    1,
    12000 / safeWidth,
    12000 / safeHeight,
    Math.sqrt(maxPixelArea / (safeWidth * safeHeight))
  );

  return {
    height: clampClipboardCanvasDimension(safeHeight * scale),
    width: clampClipboardCanvasDimension(safeWidth * scale)
  };
}

function copyCanvasTo2dCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Unable to mask selected pixels.");
  }

  canvas.width = source.width;
  canvas.height = source.height;
  context.drawImage(source, 0, 0);

  return canvas;
}

function applySelectionAlphaMask(
  canvas: HTMLCanvasElement,
  bounds: SelectionBounds,
  selection: Selection
) {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Unable to mask selected pixels.");
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  let hasVisiblePixels = false;

  for (let y = 0; y < canvas.height; y += 1) {
    const worldY = bounds.y + ((y + 0.5) / canvas.height) * bounds.height;

    for (let x = 0; x < canvas.width; x += 1) {
      const worldX = bounds.x + ((x + 0.5) / canvas.width) * bounds.width;
      const alphaIndex = (y * canvas.width + x) * 4 + 3;

      const selectionAlpha = getSelectionAlpha(selection, worldX, worldY);

      if (selectionAlpha <= 0) {
        imageData.data[alphaIndex] = 0;
        continue;
      }

      imageData.data[alphaIndex] = Math.round(imageData.data[alphaIndex] * (selectionAlpha / 255));

      if (imageData.data[alphaIndex] > 0) {
        hasVisiblePixels = true;
      }
    }
  }

  context.putImageData(imageData, 0, 0);

  return hasVisiblePixels;
}

type SystemClipboardSnapshot = {
  canInspect: boolean;
  image: ImageClipboardSnapshot | null;
  marker: string | null;
};

async function readSystemClipboard(): Promise<SystemClipboardSnapshot> {
  if (!navigator.clipboard) {
    return {
      canInspect: false,
      image: null,
      marker: null
    };
  }

  let marker: string | null = null;

  try {
    marker = await readSystemClipboardMarker();

    if (typeof navigator.clipboard.read !== "function") {
      return {
        canInspect: true,
        image: null,
        marker
      };
    }

    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find((type) => type.startsWith("image/"));

      if (!imageType) {
        continue;
      }

      const blob = await item.getType(imageType);

      return {
        canInspect: true,
        image: {
          blob,
          height: 0,
          name: getClipboardImageName(imageType),
          width: 0,
          x: null,
          y: null
        },
        marker
      };
    }
  } catch {
    return {
      canInspect: false,
      image: null,
      marker: null
    };
  }

  return {
    canInspect: true,
    image: null,
    marker
  };
}

async function readSystemClipboardMarker() {
  try {
    const text = await navigator.clipboard?.readText();

    return text?.startsWith(websterClipboardMarkerPrefix) ? text : null;
  } catch {
    return null;
  }
}

async function writeImageBlobToSystemClipboard(blob: Blob, marker: string) {
  if (
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== "function" ||
    !("ClipboardItem" in window)
  ) {
    return;
  }

  try {
    const mimeType = blob.type || "image/png";

    await navigator.clipboard.write([
      new ClipboardItem({
        [mimeType]: blob,
        "text/plain": new Blob([marker], { type: "text/plain" })
      })
    ]);
  } catch {
    try {
      const mimeType = blob.type || "image/png";

      await navigator.clipboard.write([
        new ClipboardItem({
          [mimeType]: blob
        })
      ]);
    } catch {
      // Clipboard image writes may be blocked by browser permissions.
    }
  }
}

async function writeClipboardTextMarker(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Clipboard text writes may be blocked by browser permissions.
  }
}

function getClipboardImageName(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return "Clipboard image.jpg";
  }

  if (mimeType === "image/webp") {
    return "Clipboard image.webp";
  }

  return "Clipboard image.png";
}

function createClipboardMarker(kind: "image" | "layers") {
  return `${websterClipboardMarkerPrefix}${kind}:${Date.now()}:${crypto.randomUUID()}`;
}
