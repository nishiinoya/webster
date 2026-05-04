import { AdjustmentLayer } from "../layers/AdjustmentLayer";
import { getLayerCorners } from "../geometry/TransformGeometry";
import { GroupLayer } from "../layers/GroupLayer";
import { Layer } from "../layers/Layer";
import type { LayerFilterSettings, Object3DKind, SerializedLayer } from "../layers/Layer";
import { Object3DLayer } from "../layers/Object3DLayer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { SelectionManager } from "../selection/SelectionManager";
import { disposeLayer, cloneLayer } from "./sceneLayerCloning";
import { hitTestVisibleLayer, hitTestVisibleLayerInsideGroup } from "./sceneHitTesting";
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
import type { SerializedProjectTemplateMetadata } from "./sceneSerialization";
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

export type LayerStackPlacement = "above" | "below" | "inside";

export type LayerClipboardSnapshot = {
  layers: Layer[];
  rootLayerIds: string[];
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
  selectedLayerIds?: string[];
  template?: SerializedProjectTemplateMetadata;
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
  selectedLayerIds: string[] = [];

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
    scene.selectLayers(loaded.selectedLayerIds);

    return scene;
  }

  /**
   * Appends a layer to the scene and makes it the active selection.
   */
  addLayer<T extends Layer>(layer: T) {
    this.layers.push(layer);
    this.setSelectedLayerIds([layer.id]);

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
   * Creates a default isolated 3D object layer in the middle of the document.
   */
  addObject3DLayer(objectKind: Object3DKind = "cube") {
    const size = Math.min(this.document.width, this.document.height, 280);

    return this.addLayer(
      new Object3DLayer({
        height: size,
        id: crypto.randomUUID(),
        materialTexture: {
          blend: 0.28,
          color: [0.08, 0.12, 0.14, 0.8],
          contrast: 0.7,
          kind: "checkerboard",
          scale: 14
        },
        name: getObject3DLayerName(objectKind),
        objectKind,
        width: size,
        x: this.document.x + (this.document.width - size) / 2,
        y: this.document.y + (this.document.height - size) / 2
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

    const layer = this.layers[layerIndex];
    const removedLayers = layer instanceof GroupLayer ? this.getGroupSubtree(layer.id) : [layer];
    const affectedGroupIds = [
      ...new Set(removedLayers.map((removedLayer) => removedLayer.groupId).filter(Boolean) as string[])
    ];

    this.layers.splice(
      0,
      this.layers.length,
      ...this.layers.filter((candidate) => !removedLayers.includes(candidate))
    );

    for (const removedLayer of removedLayers) {
      disposeLayer(removedLayer);
    }

    if (removedLayers.some((removedLayer) => removedLayer.id === this.selectedLayerId)) {
      this.setSelectedLayerIds(this.layers.at(-1)?.id ? [this.layers.at(-1)!.id] : []);
    } else {
      this.setSelectedLayerIds(this.selectedLayerIds);
    }

    for (const groupId of affectedGroupIds) {
      this.updateParentGroupBounds(groupId);
    }

    return layer;
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
      this.setSelectedLayerIds([]);
      return null;
    }

    const layer = this.getLayer(layerId);

    if (!layer) {
      return null;
    }

    this.setSelectedLayerIds([layer.id]);

    return layer;
  }

  selectLayers(layerIds: string[]) {
    this.setSelectedLayerIds(layerIds);

    return this.selectedLayerIds.map((layerId) => this.getLayer(layerId)).filter(Boolean);
  }

  /**
   * Finds the topmost visible editable layer under the provided world-space point.
   */
  hitTestLayer(x: number, y: number) {
    return hitTestVisibleLayer(this.layers, x, y);
  }

  /**
   * Finds the topmost visible layer inside a group under the provided world-space point.
   */
  hitTestLayerInsideGroup(groupId: string, x: number, y: number) {
    return hitTestVisibleLayerInsideGroup(this.layers, groupId, x, y);
  }

  /**
   * Moves an unlocked layer to a new world position.
   */
  moveLayer(layerId: string, x: number, y: number) {
    const layer = this.getLayer(layerId);

    if (!layer || layer.locked) {
      return null;
    }

    if (layer instanceof GroupLayer) {
      return this.moveGroupLayer(layer, x, y);
    }

    layer.x = x;
    layer.y = y;
    this.updateParentGroupBounds(layer.groupId);

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

    const beforeX = layer.x;
    const beforeY = layer.y;
    const updatedLayer = applySceneLayerUpdates(layer, updates);

    if (updatedLayer instanceof GroupLayer) {
      const deltaX = updatedLayer.x - beforeX;
      const deltaY = updatedLayer.y - beforeY;

      if (deltaX !== 0 || deltaY !== 0) {
        for (const child of this.getGroupDescendants(updatedLayer.id)) {
          child.x += deltaX;
          child.y += deltaY;
        }
      }

      this.updateParentGroupBounds(updatedLayer.groupId);
    } else {
      this.updateParentGroupBounds(updatedLayer.groupId);
    }

    return updatedLayer;
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

    if (layer instanceof GroupLayer) {
      const groupSubtree = this.getGroupSubtree(layer.id);
      const groupIdMap = new Map(
        groupSubtree
          .filter((candidate): candidate is GroupLayer => candidate instanceof GroupLayer)
          .map((group) => [group.id, crypto.randomUUID()])
      );
      const copies = groupSubtree.map((candidate) =>
        cloneLayer(candidate, {
          groupId: candidate.id === layer.id
            ? layer.groupId
            : candidate.groupId
              ? groupIdMap.get(candidate.groupId) ?? candidate.groupId
              : null,
          id: candidate instanceof GroupLayer ? groupIdMap.get(candidate.id) : undefined,
          locked: candidate.locked,
          name: candidate.id === layer.id ? `${candidate.name} copy` : candidate.name,
          xOffset: 24,
          yOffset: -24
        })
      );
      const groupCopy = copies.find((copy) => copy.id === groupIdMap.get(layer.id)) ?? null;
      const layerIndex = this.layers.findIndex((candidate) => candidate.id === layerId);

      this.layers.splice(layerIndex + 1, 0, ...copies);
      this.updateParentGroupBounds(layer.groupId);
      this.setSelectedLayerIds(groupCopy ? [groupCopy.id] : []);

      return groupCopy;
    }

    const copy = cloneLayer(layer);
    const layerIndex = this.layers.findIndex((candidate) => candidate.id === layerId);

    this.layers.splice(layerIndex + 1, 0, copy);
    this.updateParentGroupBounds(copy.groupId);
    this.setSelectedLayerIds([copy.id]);

    return copy;
  }

  createLayerClipboardSnapshot(layerIds: string[] = this.selectedLayerIds): LayerClipboardSnapshot | null {
    const rootLayers = this.getMovableRootLayers(layerIds);

    if (rootLayers.length === 0) {
      return null;
    }

    const layers = this.getLayerBlocks(rootLayers).map((layer) =>
      cloneLayer(layer, {
        groupId: layer.groupId,
        id: layer.id,
        locked: layer.locked,
        name: layer.name,
        xOffset: 0,
        yOffset: 0
      })
    );

    return {
      layers,
      rootLayerIds: rootLayers.map((layer) => layer.id)
    };
  }

  pasteLayerClipboardSnapshot(snapshot: LayerClipboardSnapshot) {
    if (snapshot.layers.length === 0 || snapshot.rootLayerIds.length === 0) {
      return null;
    }

    const idMap = new Map(snapshot.layers.map((layer) => [layer.id, crypto.randomUUID()]));
    const rootLayerIds = new Set(snapshot.rootLayerIds);
    const copiedLayerIds = new Set(snapshot.layers.map((layer) => layer.id));
    const pastedLayers = snapshot.layers.map((layer) =>
      cloneLayer(layer, {
        groupId:
          layer.groupId && copiedLayerIds.has(layer.groupId) && !rootLayerIds.has(layer.id)
            ? idMap.get(layer.groupId) ?? null
            : null,
        id: idMap.get(layer.id),
        locked: layer.locked,
        name: layer.name,
        xOffset: 24,
        yOffset: -24
      })
    );
    const pastedRootLayerIds = snapshot.rootLayerIds
      .map((layerId) => idMap.get(layerId))
      .filter((layerId): layerId is string => Boolean(layerId));

    this.layers.push(...pastedLayers);
    this.setSelectedLayerIds(pastedRootLayerIds);

    return pastedLayers;
  }

  removeLayersById(layerIds: string[]) {
    const rootLayers = this.getMovableRootLayers(layerIds);

    if (rootLayers.length === 0) {
      return null;
    }

    const removedLayers = this.getLayerBlocks(rootLayers);
    const removedLayerSet = new Set(removedLayers);
    const affectedGroupIds = [
      ...new Set(removedLayers.map((removedLayer) => removedLayer.groupId).filter(Boolean) as string[])
    ];

    this.layers.splice(
      0,
      this.layers.length,
      ...this.layers.filter((candidate) => !removedLayerSet.has(candidate))
    );

    for (const removedLayer of removedLayers) {
      disposeLayer(removedLayer);
    }

    this.setSelectedLayerIds([]);

    for (const groupId of affectedGroupIds) {
      this.updateParentGroupBounds(groupId);
    }

    return removedLayers;
  }

  groupLayers(layerIds: string[], name = "Group") {
    const requestedLayers = [
      ...new Set(layerIds.map((layerId) => this.getLayer(layerId)).filter((layer): layer is Layer => Boolean(layer)))
    ];
    const selectedLayers = requestedLayers.filter(
      (layer) =>
        !requestedLayers.some(
          (candidate) => candidate instanceof GroupLayer && candidate.id !== layer.id && this.isLayerInGroup(layer, candidate.id)
        )
    );

    if (selectedLayers.length < 2) {
      return null;
    }

    const groupId = crypto.randomUUID();
    const commonParentGroupId = getCommonGroupId(selectedLayers);
    const previousGroupIds = [
      ...new Set(selectedLayers.map((layer) => layer.groupId).filter(Boolean) as string[])
    ];
    const bounds = getLayerUnionBounds(selectedLayers);

    if (!bounds) {
      return null;
    }

    for (const layer of selectedLayers) {
      layer.groupId = groupId;
    }

    const group = new GroupLayer({
      collapsed: false,
      groupId: commonParentGroupId,
      height: bounds.height,
      id: groupId,
      name: name.trim() || "Group",
      width: bounds.width,
      x: bounds.x,
      y: bounds.y
    });
    const insertIndex =
      Math.max(...selectedLayers.map((layer) => this.layers.findIndex((candidate) => candidate.id === layer.id))) +
      1;

    this.layers.splice(insertIndex, 0, group);
    this.setSelectedLayerIds([group.id]);

    for (const previousGroupId of previousGroupIds) {
      this.updateParentGroupBounds(previousGroupId);
    }

    this.updateParentGroupBounds(commonParentGroupId);

    return group;
  }

  moveLayersToPosition(
    layerIds: string[],
    targetLayerId: string,
    placement: LayerStackPlacement
  ) {
    const targetLayer = this.getLayer(targetLayerId);

    if (!targetLayer || (placement === "inside" && !(targetLayer instanceof GroupLayer))) {
      return null;
    }

    const movingLayers = this.getMovableRootLayers(layerIds);

    if (movingLayers.length === 0 || movingLayers.some((layer) => layer.id === targetLayer.id)) {
      return null;
    }

    const movingBlock = this.getLayerBlocks(movingLayers);
    const movingLayerSet = new Set(movingBlock);

    if (movingLayerSet.has(targetLayer)) {
      return null;
    }

    const previousGroupIds = [
      ...new Set(movingLayers.map((layer) => layer.groupId).filter(Boolean) as string[])
    ];
    const nextGroupId = placement === "inside" ? targetLayer.id : targetLayer.groupId;

    if (placement === "inside" && targetLayer instanceof GroupLayer) {
      targetLayer.collapsed = false;
    }

    for (const layer of movingLayers) {
      layer.groupId = nextGroupId;
    }

    const remainingLayers = this.layers.filter((layer) => !movingLayerSet.has(layer));
    const targetIndex = remainingLayers.findIndex((layer) => layer.id === targetLayer.id);

    if (targetIndex < 0) {
      return null;
    }

    const targetBlock =
      targetLayer instanceof GroupLayer
        ? this.getGroupSubtreeFromLayers(targetLayer.id, remainingLayers)
        : [targetLayer];
    const targetIndexes = targetBlock
      .map((layer) => remainingLayers.findIndex((candidate) => candidate.id === layer.id))
      .filter((index) => index >= 0);

    if (targetIndexes.length === 0) {
      return null;
    }

    const insertIndex =
      placement === "inside"
        ? targetIndex
        : placement === "above"
          ? Math.max(...targetIndexes) + 1
          : Math.min(...targetIndexes);

    this.layers.splice(0, this.layers.length, ...remainingLayers);
    this.layers.splice(insertIndex, 0, ...movingBlock);
    this.setSelectedLayerIds(movingLayers.map((layer) => layer.id));

    for (const groupId of previousGroupIds) {
      this.updateParentGroupBounds(groupId);
    }

    this.updateParentGroupBounds(nextGroupId);

    return movingLayers;
  }

  removeLayersFromGroup(layerIds: string[]) {
    const movingLayers = this.getMovableRootLayers(layerIds).filter((layer) => layer.groupId);

    if (movingLayers.length === 0) {
      return null;
    }

    const previousGroupIds = [
      ...new Set(movingLayers.map((layer) => layer.groupId).filter(Boolean) as string[])
    ];
    const nextGroupIds = new Set<string>();

    for (const layer of movingLayers) {
      const parentGroup = layer.groupId ? this.getLayer(layer.groupId) : null;
      const nextGroupId = parentGroup?.groupId ?? null;

      layer.groupId = nextGroupId;

      if (nextGroupId) {
        nextGroupIds.add(nextGroupId);
      }
    }

    this.setSelectedLayerIds(movingLayers.map((layer) => layer.id));

    for (const groupId of previousGroupIds) {
      this.updateParentGroupBounds(groupId);
    }

    for (const groupId of nextGroupIds) {
      this.updateParentGroupBounds(groupId);
    }

    return movingLayers;
  }

  /**
   * Moves a layer to a clamped index within the current layer stack.
   */
  reorderLayer(layerId: string, targetIndex: number) {
    const currentIndex = this.layers.findIndex((layer) => layer.id === layerId);

    if (currentIndex < 0) {
      return null;
    }

    const layer = this.layers[currentIndex];

    if (layer instanceof GroupLayer) {
      return this.reorderGroupLayer(layer, targetIndex);
    }

    const nextIndex = Math.min(Math.max(targetIndex, 0), this.layers.length - 1);
    const [movedLayer] = this.layers.splice(currentIndex, 1);
    this.layers.splice(nextIndex, 0, movedLayer);

    return movedLayer;
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
    const collapsedGroupIds = new Set<string>();
    const summaries = [];

    for (const layer of [...this.layers].reverse()) {
      if (this.getLayerAncestorIds(layer).some((groupId) => collapsedGroupIds.has(groupId))) {
        continue;
      }

      const summary = getLayerSummary(layer, this.selectedLayerId, {
        childCount: layer instanceof GroupLayer ? this.getGroupDescendants(layer.id).length : 0,
        depth: this.getLayerDepth(layer),
        selectedLayerIds: this.selectedLayerIds
      });

      summaries.push(summary);

      if (layer instanceof GroupLayer && layer.collapsed) {
        collapsedGroupIds.add(layer.id);
      }
    }

    return summaries;
  }

  insertSceneAsGroup(templateScene: Scene, name: string) {
    const groupId = crypto.randomUUID();
    const groupName = name.trim() || "Template group";
    const templateCenter = {
      x: templateScene.document.x + templateScene.document.width / 2,
      y: templateScene.document.y + templateScene.document.height / 2
    };
    const documentCenter = {
      x: this.document.x + this.document.width / 2,
      y: this.document.y + this.document.height / 2
    };
    const xOffset = documentCenter.x - templateCenter.x;
    const yOffset = documentCenter.y - templateCenter.y;
    const layersToInsert: Layer[] = [];

    if (templateScene.document.color[3] > 0) {
      layersToInsert.push(
        new ShapeLayer({
          fillColor: [...templateScene.document.color],
          groupId,
          height: templateScene.document.height,
          id: crypto.randomUUID(),
          locked: true,
          name: "Template background",
          shape: "rectangle",
          strokeColor: [0, 0, 0, 0],
          strokeWidth: 0,
          width: templateScene.document.width,
          x: templateScene.document.x + xOffset,
          y: templateScene.document.y + yOffset
        })
      );
    }

    const templateGroupIdMap = new Map(
      templateScene.layers
        .filter((layer): layer is GroupLayer => layer instanceof GroupLayer)
        .map((group) => [group.id, crypto.randomUUID()])
    );

    for (const layer of templateScene.layers) {
      const mappedLayerId = layer instanceof GroupLayer ? templateGroupIdMap.get(layer.id) : undefined;
      const mappedGroupId = layer.groupId
        ? templateGroupIdMap.get(layer.groupId) ?? groupId
        : groupId;

      layersToInsert.push(
        cloneLayer(layer, {
          groupId: mappedGroupId,
          id: mappedLayerId,
          locked: layer.locked,
          name: layer.name,
          xOffset,
          yOffset
        })
      );
    }

    const bounds = getLayerUnionBounds(layersToInsert) ?? {
      height: templateScene.document.height,
      width: templateScene.document.width,
      x: templateScene.document.x + xOffset,
      y: templateScene.document.y + yOffset
    };
    const group = new GroupLayer({
      collapsed: false,
      height: bounds.height,
      id: groupId,
      name: groupName,
      width: bounds.width,
      x: bounds.x,
      y: bounds.y
    });

    this.layers.push(...layersToInsert, group);
    this.setSelectedLayerIds([group.id]);

    return group;
  }

  /**
   * Serializes the current scene into the persisted project format.
   */
  async toJSON(): Promise<SerializedScene> {
    return serializeSceneToJSON({
      document: this.document,
      layers: this.layers,
      selectedLayerId: this.selectedLayerId,
      selectedLayerIds: this.selectedLayerIds
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

  private getGroupChildren(groupId: string) {
    return this.layers.filter((layer) => layer.groupId === groupId);
  }

  private getGroupChildrenFromLayers(groupId: string, layers: Layer[]) {
    return layers.filter((layer) => layer.groupId === groupId);
  }

  private getGroupDescendants(groupId: string) {
    const descendants: Layer[] = [];
    const visitedGroupIds = new Set<string>();

    const collect = (currentGroupId: string) => {
      if (visitedGroupIds.has(currentGroupId)) {
        return;
      }

      visitedGroupIds.add(currentGroupId);

      for (const child of this.getGroupChildren(currentGroupId)) {
        descendants.push(child);

        if (child instanceof GroupLayer) {
          collect(child.id);
        }
      }
    };

    collect(groupId);

    return descendants;
  }

  private getGroupSubtree(groupId: string) {
    const subtreeIds = new Set([groupId, ...this.getGroupDescendants(groupId).map((layer) => layer.id)]);

    return this.layers.filter((layer) => subtreeIds.has(layer.id));
  }

  private getGroupSubtreeFromLayers(groupId: string, layers: Layer[]) {
    const subtreeIds = new Set([groupId]);
    const visitedGroupIds = new Set<string>();

    const collect = (currentGroupId: string) => {
      if (visitedGroupIds.has(currentGroupId)) {
        return;
      }

      visitedGroupIds.add(currentGroupId);

      for (const child of this.getGroupChildrenFromLayers(currentGroupId, layers)) {
        subtreeIds.add(child.id);

        if (child instanceof GroupLayer) {
          collect(child.id);
        }
      }
    };

    collect(groupId);

    return layers.filter((layer) => subtreeIds.has(layer.id));
  }

  private getMovableRootLayers(layerIds: string[]) {
    const requestedLayers = [
      ...new Set(layerIds.map((layerId) => this.getLayer(layerId)).filter((layer): layer is Layer => Boolean(layer)))
    ];

    return requestedLayers.filter(
      (layer) =>
        !requestedLayers.some(
          (candidate) =>
            candidate instanceof GroupLayer &&
            candidate.id !== layer.id &&
            this.isLayerInGroup(layer, candidate.id)
        )
    );
  }

  private getLayerBlocks(rootLayers: Layer[]) {
    const blockIds = new Set<string>();

    for (const layer of rootLayers) {
      blockIds.add(layer.id);

      if (layer instanceof GroupLayer) {
        for (const descendant of this.getGroupDescendants(layer.id)) {
          blockIds.add(descendant.id);
        }
      }
    }

    return this.layers.filter((layer) => blockIds.has(layer.id));
  }

  private getLayerAncestorIds(layer: Layer) {
    const ancestorIds: string[] = [];
    const visitedGroupIds = new Set<string>();
    let groupId = layer.groupId;

    while (groupId && !visitedGroupIds.has(groupId)) {
      visitedGroupIds.add(groupId);
      ancestorIds.push(groupId);

      const group = this.getLayer(groupId);

      groupId = group?.groupId ?? null;
    }

    return ancestorIds;
  }

  private getLayerDepth(layer: Layer) {
    return this.getLayerAncestorIds(layer).length;
  }

  private isLayerInGroup(layer: Layer, groupId: string) {
    return this.getLayerAncestorIds(layer).includes(groupId);
  }

  private setSelectedLayerIds(layerIds: string[]) {
    const validLayerIds = [
      ...new Set(layerIds.filter((layerId) => this.layers.some((layer) => layer.id === layerId)))
    ];

    this.selectedLayerIds = validLayerIds;
    this.selectedLayerId = validLayerIds.at(-1) ?? null;
  }

  private moveGroupLayer(group: GroupLayer, x: number, y: number) {
    const deltaX = x - group.x;
    const deltaY = y - group.y;

    group.x = x;
    group.y = y;

    for (const child of this.getGroupDescendants(group.id)) {
      child.x += deltaX;
      child.y += deltaY;
    }

    this.updateParentGroupBounds(group.groupId);

    return group;
  }

  private updateParentGroupBounds(groupId: string | null) {
    if (!groupId) {
      return;
    }

    const group = this.getLayer(groupId);

    if (!(group instanceof GroupLayer)) {
      return;
    }

    const bounds = getLayerUnionBounds(this.getGroupChildren(group.id));

    if (!bounds) {
      return;
    }

    group.x = bounds.x;
    group.y = bounds.y;
    group.width = bounds.width;
    group.height = bounds.height;
    group.scaleX = 1;
    group.scaleY = 1;
    this.updateParentGroupBounds(group.groupId);
  }

  private reorderGroupLayer(group: GroupLayer, targetIndex: number) {
    const block = this.getGroupSubtree(group.id);
    const blockSet = new Set(block);
    const remainingLayers = this.layers.filter((layer) => !blockSet.has(layer));
    const currentIndex = this.layers.findIndex((layer) => layer.id === group.id);
    const adjustedTargetIndex =
      targetIndex > currentIndex ? targetIndex - block.length + 1 : targetIndex;
    const nextIndex = Math.min(Math.max(adjustedTargetIndex, 0), remainingLayers.length);

    this.layers.splice(0, this.layers.length, ...remainingLayers);
    this.layers.splice(nextIndex, 0, ...block);

    return group;
  }
}

function getObject3DLayerName(objectKind: Object3DKind) {
  switch (objectKind) {
    case "sphere":
      return "3D sphere";
    case "pyramid":
      return "3D pyramid";
    case "imported":
      return "3D model";
    default:
      return "3D cube";
  }
}

function getCommonGroupId(layers: Layer[]) {
  const firstGroupId = layers[0]?.groupId ?? null;

  return layers.every((layer) => (layer.groupId ?? null) === firstGroupId) ? firstGroupId : null;
}

function getLayerUnionBounds(layers: Layer[]) {
  if (layers.length === 0) {
    return null;
  }

  const points = layers.flatMap((layer) => {
    const corners = getLayerCorners(layer);

    return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  });
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
