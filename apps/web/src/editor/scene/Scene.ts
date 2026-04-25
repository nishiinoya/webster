import { AdjustmentLayer } from "../layers/AdjustmentLayer";
import { Layer } from "../layers/Layer";
import type { LayerFilterSettings, SerializedLayer } from "../layers/Layer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { SelectionManager } from "../selection/SelectionManager";
import { disposeLayer, cloneLayer } from "./sceneLayerCloning";
import { hitTestVisibleLayer } from "./sceneHitTesting";
import { applySceneLayerUpdates } from "./sceneLayerUpdates";
import type { SceneLayerUpdates } from "./sceneLayerUpdates";
import { applyLayerMaskAction } from "./sceneMaskActions";
import type { LayerMaskAction } from "./sceneMaskActions";
import {
  clampDocumentSize,
  getDocumentResizeOffset
} from "./sceneResize";
import type { DocumentResizeAnchor } from "./sceneResize";
import { loadSceneFromJSON, serializeSceneToJSON } from "./sceneSerialization";
import { getLayerSummary } from "./sceneSummaries";

export type { LayerMaskAction } from "./sceneMaskActions";
export type { DocumentResizeAnchor } from "./sceneResize";
export type { SceneLayerUpdates } from "./sceneLayerUpdates";

export type DocumentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: [number, number, number, number];
};

export type SerializedScene = {
  app: "webster";
  canvas: {
    background: [number, number, number, number];
    height: number;
    width: number;
    x?: number;
    y?: number;
  };
  layers: SerializedLayer[];
  selectedLayerId?: string | null;
  version: 1;
};

/**
 * Owns the editable document state, layer stack, and scene-level mutations.
 */
export class Scene {
  readonly document: DocumentBounds;
  readonly selection = new SelectionManager();

  readonly layers: Layer[] = [];
  selectedLayerId: string | null = null;

  constructor(
    options: {
      createDefaultLayer?: boolean;
      documentHeight?: number;
      documentWidth?: number;
    } = {}
  ) {
    const documentWidth = options.documentWidth ?? 800;
    const documentHeight = options.documentHeight ?? 600;

    this.document = {
      x: -documentWidth / 2,
      y: -documentHeight / 2,
      width: documentWidth,
      height: documentHeight,
      color: [0.96, 0.97, 0.94, 1]
    };

    if (options.createDefaultLayer ?? true) {
      this.addLayer(
        new ShapeLayer({
          id: "default-shape",
          name: "Rectangle",
          x: -110,
          y: -60,
          width: 260,
          height: 160,
          shape: "rectangle",
          fillColor: [0.18, 0.49, 0.44, 1],
          strokeColor: [0.07, 0.08, 0.09, 1],
          strokeWidth: 0
        })
      );
    }
  }

  /**
   * Recreates a scene from serialized project data and referenced binary assets.
   */
  static async fromJSON(data: SerializedScene, assets = new Map<string, Blob>()) {
    const scene = new Scene({ createDefaultLayer: false });
    const loaded = await loadSceneFromJSON(data, assets);

    scene.document.x = loaded.document.x;
    scene.document.y = loaded.document.y;
    scene.document.width = loaded.document.width;
    scene.document.height = loaded.document.height;
    scene.document.color = loaded.document.color;
    scene.layers.push(...loaded.layers);
    scene.selectedLayerId = loaded.selectedLayerId;

    return scene;
  }

  /**
   * Appends a layer to the scene and makes it the active selection.
   */
  addLayer(layer: Layer) {
    this.layers.push(layer);
    this.selectedLayerId = layer.id;

    return layer;
  }

  /**
   * Creates a full-document adjustment layer and inserts it into the scene.
   */
  addAdjustmentLayer() {
    return this.addLayer(
      new AdjustmentLayer({
        id: crypto.randomUUID(),
        name: "Adjustment",
        x: this.document.x,
        y: this.document.y,
        width: this.document.width,
        height: this.document.height
      })
    );
  }

  /**
   * Resizes the document bounds and shifts the origin according to the resize anchor.
   */
  resizeDocument(width: number, height: number, anchor: DocumentResizeAnchor = "center") {
    const nextWidth = clampDocumentSize(width);
    const nextHeight = clampDocumentSize(height);
    const currentWidth = this.document.width;
    const currentHeight = this.document.height;
    const deltaWidth = nextWidth - currentWidth;
    const deltaHeight = nextHeight - currentHeight;
    const offset = getDocumentResizeOffset(deltaWidth, deltaHeight, anchor);

    this.document.x += offset.x;
    this.document.y += offset.y;
    this.document.width = nextWidth;
    this.document.height = nextHeight;

    return this.document;
  }

  /**
   * Removes a layer from the stack and disposes any resources it owns.
   */
  removeLayer(layerId: string) {
    const layerIndex = this.layers.findIndex((layer) => layer.id === layerId);

    if (layerIndex < 0) {
      return null;
    }

    const [removedLayer] = this.layers.splice(layerIndex, 1);

    disposeLayer(removedLayer);

    if (this.selectedLayerId === layerId) {
      this.selectedLayerId = this.layers.at(-1)?.id ?? null;
    }

    return removedLayer;
  }

  /**
   * Returns the layer with the provided id when it exists.
   */
  getLayer(layerId: string) {
    return this.layers.find((layer) => layer.id === layerId) ?? null;
  }

  /**
   * Updates the selected layer and returns the resolved layer when selection succeeds.
   */
  selectLayer(layerId: string | null) {
    if (layerId === null) {
      this.selectedLayerId = null;
      return null;
    }

    const layer = this.getLayer(layerId);

    if (!layer) {
      return null;
    }

    this.selectedLayerId = layer.id;

    return layer;
  }

  /**
   * Finds the topmost visible editable layer under the provided world-space point.
   */
  hitTestLayer(x: number, y: number) {
    return hitTestVisibleLayer(this.layers, x, y);
  }

  /**
   * Moves an unlocked layer to a new world position.
   */
  moveLayer(layerId: string, x: number, y: number) {
    const layer = this.getLayer(layerId);

    if (!layer || layer.locked) {
      return null;
    }

    layer.x = x;
    layer.y = y;

    return layer;
  }

  /**
   * Applies a partial update object to a layer and returns the updated instance.
   */
  updateLayer(layerId: string, updates: SceneLayerUpdates) {
    const layer = this.getLayer(layerId);

    if (!layer) {
      return null;
    }
    return applySceneLayerUpdates(layer, updates);
  }

  /**
   * Applies a mask command to an unlocked layer.
   */
  updateLayerMask(layerId: string, action: LayerMaskAction) {
    const layer = this.getLayer(layerId);

    if (!layer || layer.locked) {
      return null;
    }

    return applyLayerMaskAction(layer, action);
  }

  /**
   * Duplicates a layer, inserts the copy above the source, and selects it.
   */
  duplicateLayer(layerId: string) {
    const layer = this.getLayer(layerId);

    if (!layer) {
      return null;
    }

    const copy = cloneLayer(layer);
    const layerIndex = this.layers.findIndex((candidate) => candidate.id === layerId);

    this.layers.splice(layerIndex + 1, 0, copy);
    this.selectedLayerId = copy.id;

    return copy;
  }

  /**
   * Moves a layer to a clamped index within the current layer stack.
   */
  reorderLayer(layerId: string, targetIndex: number) {
    const currentIndex = this.layers.findIndex((layer) => layer.id === layerId);

    if (currentIndex < 0) {
      return null;
    }

    const nextIndex = Math.min(Math.max(targetIndex, 0), this.layers.length - 1);
    const [layer] = this.layers.splice(currentIndex, 1);
    this.layers.splice(nextIndex, 0, layer);

    return layer;
  }

  moveLayerForward(layerId: string) {
    const currentIndex = this.layers.findIndex((layer) => layer.id === layerId);

    if (currentIndex < 0) {
      return null;
    }

    return this.reorderLayer(layerId, currentIndex + 1);
  }

  moveLayerBackward(layerId: string) {
    const currentIndex = this.layers.findIndex((layer) => layer.id === layerId);

    if (currentIndex < 0) {
      return null;
    }

    return this.reorderLayer(layerId, currentIndex - 1);
  }

  moveLayerToFront(layerId: string) {
    return this.reorderLayer(layerId, this.layers.length - 1);
  }

  moveLayerToBack(layerId: string) {
    return this.reorderLayer(layerId, 0);
  }

  /**
   * Returns UI-facing layer summaries in top-to-bottom display order.
   */
  getLayerSummaries() {
    return this.layers.map((layer) => getLayerSummary(layer, this.selectedLayerId)).reverse();
  }

  /**
   * Serializes the current scene into the persisted project format.
   */
  async toJSON(): Promise<SerializedScene> {
    return serializeSceneToJSON({
      document: this.document,
      layers: this.layers,
      selectedLayerId: this.selectedLayerId
    });
  }

  /**
   * Disposes all layers currently owned by the scene.
   */
  dispose() {
    for (const layer of this.layers) {
      disposeLayer(layer);
    }
  }
}
