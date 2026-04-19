import { editorRenderOptions, imageExportRenderOptions, Renderer } from "../rendering/Renderer";
import { InputController } from "../tools/input/InputController";
import type { MaskBrushOptions } from "../tools/mask-brush/MaskBrushTypes";
import type { DrawingToolOptions } from "../tools/drawing/DrawingTool";
import type { ToolPointerEvent } from "../tools/move/MoveTool";
import { Camera2D } from "../geometry/Camera2D";
import { Scene } from "../scene/Scene";
import type { LayerMaskAction } from "../scene/Scene";
import { exportScenePackage, importScenePackage } from "../projects/ProjectPackage";
import { ImageLayer } from "../layers/ImageLayer";
import { TextLayer } from "../layers/TextLayer";
import type { ShapeKind } from "../layers/ShapeLayer";


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

export type ImageExportFormat = "jpeg" | "pdf" | "png";

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
  private textEditLayerId: string | null = null;
  private textCaretIndex = 0;
  private textSelectionEnd: number | null = null;
  private textSelectionStart: number | null = null;
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

  startTextEditAtClientPoint(clientX: number, clientY: number) {
    const screenPoint = this.getCanvasPoint(clientX, clientY);
    const worldPoint = this.camera.screenToWorld(screenPoint.x, screenPoint.y);
    const layer = this.scene.hitTestLayer(worldPoint.x, worldPoint.y);

    if (layer instanceof TextLayer) {
      this.scene.selectLayer(layer.id);
      this.textEditLayerId = layer.id;
      this.textCaretIndex = layer.text.length;
      this.clearTextSelection();

      return layer;
    }

    const width = 360;
    const height = 120;
    const nextLayer = new TextLayer({
      id: crypto.randomUUID(),
      name: "Text",
      x: worldPoint.x,
      y: worldPoint.y - height,
      width,
      height,
      text: "",
      fontSize: 48,
      fontFamily: "Arial",
      color: [0.05, 0.06, 0.07, 1],
      bold: false,
      italic: false,
      align: "left"
    });

    this.scene.addLayer(nextLayer);
    this.textEditLayerId = nextLayer.id;
    this.textCaretIndex = 0;
    this.clearTextSelection();

    return nextLayer;
  }

  startTextSelectionAtClientPoint(clientX: number, clientY: number) {
    const layer = this.startTextEditAtClientPoint(clientX, clientY);

    if (!layer) {
      return false;
    }

    const index = this.getTextIndexAtClientPoint(layer, clientX, clientY);

    this.textCaretIndex = index;
    this.textSelectionStart = index;
    this.textSelectionEnd = index;

    return true;
  }

  updateTextSelectionAtClientPoint(clientX: number, clientY: number) {
    const layer = this.getActiveTextEditLayer();

    if (!layer || this.textSelectionStart === null) {
      return false;
    }

    this.textSelectionEnd = this.getTextIndexAtClientPoint(layer, clientX, clientY);
    this.textCaretIndex = this.textSelectionEnd;

    return true;
  }

  endTextSelection() {
    return this.textSelectionStart !== null;
  }

  finishTextEdit() {
    this.textEditLayerId = null;
    this.textCaretIndex = 0;
    this.clearTextSelection();
  }

  insertTextInput(text: string) {
    const layer = this.getActiveTextEditLayer();

    if (!layer || layer.locked || !text) {
      return false;
    }

    const selection = this.getTextSelectionRange(layer);
    const insertStart = selection?.start ?? this.textCaretIndex;
    const insertEnd = selection?.end ?? this.textCaretIndex;

    layer.text = layer.text.slice(0, insertStart) + text + layer.text.slice(insertEnd);
    this.textCaretIndex = insertStart + text.length;
    this.clearTextSelection();

    return true;
  }

  deleteTextBackward() {
    const layer = this.getActiveTextEditLayer();

    if (!layer || layer.locked) {
      return false;
    }

    const selection = this.getTextSelectionRange(layer);

    if (selection) {
      layer.text = layer.text.slice(0, selection.start) + layer.text.slice(selection.end);
      this.textCaretIndex = selection.start;
      this.clearTextSelection();
      return true;
    }

    if (this.textCaretIndex <= 0) {
      return false;
    }

    layer.text =
      layer.text.slice(0, this.textCaretIndex - 1) + layer.text.slice(this.textCaretIndex);
    this.textCaretIndex -= 1;
    this.clearTextSelection();

    return true;
  }

  deleteTextForward() {
    const layer = this.getActiveTextEditLayer();

    if (!layer || layer.locked) {
      return false;
    }

    const selection = this.getTextSelectionRange(layer);

    if (selection) {
      layer.text = layer.text.slice(0, selection.start) + layer.text.slice(selection.end);
      this.textCaretIndex = selection.start;
      this.clearTextSelection();
      return true;
    }

    if (this.textCaretIndex >= layer.text.length) {
      return false;
    }

    layer.text =
      layer.text.slice(0, this.textCaretIndex) + layer.text.slice(this.textCaretIndex + 1);
    this.clearTextSelection();

    return true;
  }

  getSelectedTextInput() {
    const layer = this.getActiveTextEditLayer();

    if (!layer) {
      return null;
    }

    const selection = this.getTextSelectionRange(layer);

    return selection ? layer.text.slice(selection.start, selection.end) : null;
  }

  selectAllTextInput() {
    const layer = this.getActiveTextEditLayer();

    if (!layer) {
      return false;
    }

    this.textSelectionStart = 0;
    this.textSelectionEnd = layer.text.length;
    this.textCaretIndex = layer.text.length;

    return true;
  }

  moveTextCaret(direction: "end" | "home" | "left" | "right") {
    const layer = this.getActiveTextEditLayer();

    if (!layer) {
      return false;
    }

    if (direction === "home") {
      this.textCaretIndex = 0;
      this.clearTextSelection();
      return true;
    }

    if (direction === "end") {
      this.textCaretIndex = layer.text.length;
      this.clearTextSelection();
      return true;
    }

    if (direction === "left") {
      this.textCaretIndex = Math.max(0, this.textCaretIndex - 1);
      this.clearTextSelection();
      return true;
    }

    this.textCaretIndex = Math.min(layer.text.length, this.textCaretIndex + 1);
    this.clearTextSelection();

    return true;
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

  addTextLayer() {
    const layer = new TextLayer({
      id: crypto.randomUUID(),
      name: "Text",
      x: -160,
      y: -60,
      width: 320,
      height: 120,
      text: "Text",
      fontSize: 48,
      fontFamily: "Arial",
      color: [0.05, 0.06, 0.07, 1],
      bold: false,
      italic: false,
      align: "left"
    });

    this.scene.addLayer(layer);

    return layer;
  }

  private getActiveTextEditLayer() {
    if (!this.textEditLayerId) {
      return null;
    }

    const layer = this.scene.getLayer(this.textEditLayerId);

    if (!(layer instanceof TextLayer)) {
      this.finishTextEdit();
      return null;
    }

    return layer;
  }

  private getTextIndexAtClientPoint(layer: TextLayer, clientX: number, clientY: number) {
    const screenPoint = this.getCanvasPoint(clientX, clientY);
    const worldPoint = this.camera.screenToWorld(screenPoint.x, screenPoint.y);
    const width = layer.width * layer.scaleX;
    const height = layer.height * layer.scaleY;
    const centerX = layer.x + width / 2;
    const centerY = layer.y + height / 2;
    const radians = (-layer.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = worldPoint.x - centerX;
    const dy = worldPoint.y - centerY;
    const localX = (dx * cos - dy * sin + width / 2) / Math.max(1e-6, layer.scaleX);
    const localY = (dx * sin + dy * cos + height / 2) / Math.max(1e-6, layer.scaleY);
    const boxes = layer.lastTextCharacterBoxes;

    if (boxes.length === 0) {
      return layer.text.length;
    }

    let nearestIndex = layer.text.length;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const box of boxes) {
      const centerY = box.y + box.height / 2;
      const lineDistance = Math.abs(localY - centerY);
      const xIndex = localX < box.x + box.width / 2 ? box.index : box.index + 1;
      const xDistance =
        localX < box.x
          ? box.x - localX
          : localX > box.x + box.width
            ? localX - (box.x + box.width)
            : 0;
      const distance = lineDistance * 4 + xDistance;

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = xIndex;
      }
    }

    return Math.max(0, Math.min(layer.text.length, nearestIndex));
  }

  private clearTextSelection() {
    this.textSelectionStart = null;
    this.textSelectionEnd = null;
  }

  private getTextSelectionRange(layer: TextLayer) {
    if (this.textSelectionStart === null || this.textSelectionEnd === null) {
      return null;
    }

    const start = Math.max(0, Math.min(layer.text.length, this.textSelectionStart));
    const end = Math.max(0, Math.min(layer.text.length, this.textSelectionEnd));

    if (start === end) {
      return null;
    }

    return {
      end: Math.max(start, end),
      start: Math.min(start, end)
    };
  }

}

function shouldShowSelectionOutline(tool: string) {
  return tool === "Move" || tool === "Text";
}

function getExportRenderBackground(
  format: ImageExportFormat,
  background: ImageExportBackground
): ImageExportBackground {
  if (format !== "png" && background === "transparent") {
    return "white";
  }

  return background;
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

async function createPdfFromJpeg(jpeg: Blob, width: number, height: number) {
  const imageBytes = new Uint8Array(await jpeg.arrayBuffer());
  const contentStream = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects: PdfObject[] = [
    { body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
    },
    {
      body: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>`,
      stream: imageBytes
    },
    {
      body: `<< /Length ${contentStream.length} >>`,
      stream: asciiBytes(contentStream)
    }
  ];
  const parts: PdfPart[] = ["%PDF-1.4\n"];
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(sumByteLengths(parts));
    parts.push(`${index + 1} 0 obj\n${objects[index].body}\n`);

    const stream = objects[index].stream;

    if (stream) {
      parts.push("stream\n");
      parts.push(stream);
      parts.push("\nendstream\n");
    }

    parts.push("endobj\n");
  }

  const xrefOffset = sumByteLengths(parts);
  const xrefRows = offsets.map((offset, index) =>
    index === 0 ? "0000000000 65535 f " : `${String(offset).padStart(10, "0")} 00000 n `
  );

  parts.push(
    `xref\n0 ${offsets.length}\n${xrefRows.join("\n")}\ntrailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return new Blob(parts.map(toBlobPart), { type: "application/pdf" });
}

type PdfObject = {
  body: string;
  stream?: Uint8Array;
};

type PdfPart = string | Uint8Array;

function asciiBytes(value: string) {
  return new TextEncoder().encode(value);
}

function sumByteLengths(parts: PdfPart[]) {
  return parts.reduce((total, part) => total + getPdfPartLength(part), 0);
}

function getPdfPartLength(part: PdfPart) {
  return typeof part === "string" ? asciiBytes(part).length : part.byteLength;
}

function toBlobPart(part: PdfPart): BlobPart {
  if (typeof part === "string") {
    return part;
  }

  const copy = new Uint8Array(part.byteLength);

  copy.set(part);

  return copy.buffer;
}
