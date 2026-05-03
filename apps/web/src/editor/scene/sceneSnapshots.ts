import { AdjustmentLayer } from "../layers/AdjustmentLayer";
import { GroupLayer } from "../layers/GroupLayer";
import { cloneImageLayerGeometry, ImageLayer } from "../layers/ImageLayer";
import { Layer } from "../layers/Layer";
import { LayerMask } from "../masks/LayerMask";
import type { SelectionManagerState } from "../selection/SelectionManager";
import type { SelectionMask, SelectionPoint } from "../selection/SelectionManager";
import { cloneSelectionManagerState } from "../selection/SelectionManager";
import { ShapeLayer } from "../layers/ShapeLayer";
import { StrokeLayer } from "../layers/StrokeLayer";
import { TextLayer } from "../layers/TextLayer";
import { disposeLayer } from "./sceneLayerCloning";
import { Scene } from "./Scene";

export type SceneSnapshot = {
  document: {
    color: [number, number, number, number];
    height: number;
    width: number;
    x: number;
    y: number;
  };
  layers: Layer[];
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  selection: SelectionManagerState;
};

export function captureSceneSnapshot(scene: Scene): SceneSnapshot {
  return {
    document: {
      color: [...scene.document.color],
      height: scene.document.height,
      width: scene.document.width,
      x: scene.document.x,
      y: scene.document.y
    },
    layers: scene.layers.map(cloneLayerForSnapshot),
    selectedLayerId: scene.selectedLayerId,
    selectedLayerIds: [...scene.selectedLayerIds],
    selection: cloneSelectionManagerState(scene.selection.getSnapshot())
  };
}

export function cloneSceneSnapshot(snapshot: SceneSnapshot): SceneSnapshot {
  return {
    document: {
      color: [...snapshot.document.color],
      height: snapshot.document.height,
      width: snapshot.document.width,
      x: snapshot.document.x,
      y: snapshot.document.y
    },
    layers: snapshot.layers.map(cloneLayerForSnapshot),
    selectedLayerId: snapshot.selectedLayerId,
    selectedLayerIds: [...snapshot.selectedLayerIds],
    selection: cloneSelectionManagerState(snapshot.selection)
  };
}

export function restoreSceneSnapshot(scene: Scene, snapshot: SceneSnapshot) {
  const nextSnapshot = cloneSceneSnapshot(snapshot);

  for (const layer of scene.layers) {
    disposeLayer(layer);
  }

  scene.layers.splice(0, scene.layers.length, ...nextSnapshot.layers);
  scene.selectedLayerId = nextSnapshot.selectedLayerId;
  scene.selectedLayerIds = [...nextSnapshot.selectedLayerIds];
  scene.document.x = nextSnapshot.document.x;
  scene.document.y = nextSnapshot.document.y;
  scene.document.width = nextSnapshot.document.width;
  scene.document.height = nextSnapshot.document.height;
  scene.document.color = [...nextSnapshot.document.color];
  scene.selection.restoreSnapshot(nextSnapshot.selection);
}

export function areSceneSnapshotsEqual(
  left: SceneSnapshot,
  right: SceneSnapshot,
  options: {
    includeSelectedLayerId?: boolean;
    includeSelection?: boolean;
  } = {}
) {
  const includeSelectedLayerId = options.includeSelectedLayerId ?? true;
  const includeSelection = options.includeSelection ?? true;

  if (
    left.document.x !== right.document.x ||
    left.document.y !== right.document.y ||
    left.document.width !== right.document.width ||
    left.document.height !== right.document.height ||
    !areColorArraysEqual(left.document.color, right.document.color)
  ) {
    return false;
  }

  if (left.layers.length !== right.layers.length) {
    return false;
  }

  for (let index = 0; index < left.layers.length; index += 1) {
    if (!areLayersEqual(left.layers[index], right.layers[index])) {
      return false;
    }
  }

  if (
    includeSelectedLayerId &&
    (left.selectedLayerId !== right.selectedLayerId ||
      !areStringArraysEqual(left.selectedLayerIds, right.selectedLayerIds))
  ) {
    return false;
  }

  if (includeSelection && !areSelectionStatesEqual(left.selection, right.selection)) {
    return false;
  }

  return true;
}

function cloneLayerForSnapshot(layer: Layer) {
  const baseOptions = {
    filters: { ...layer.filters },
    groupId: layer.groupId,
    height: layer.height,
    id: layer.id,
    locked: layer.locked,
    mask: cloneMaskForSnapshot(layer.mask),
    name: layer.name,
    opacity: layer.opacity,
    rotation: layer.rotation,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    visible: layer.visible,
    width: layer.width,
    x: layer.x,
    y: layer.y
  };

  if (layer instanceof ShapeLayer) {
    return new ShapeLayer({
      ...baseOptions,
      fillColor: [...layer.fillColor],
      shape: layer.shape,
      strokeColor: [...layer.strokeColor],
      strokeWidth: layer.strokeWidth
    });
  }

  if (layer instanceof ImageLayer) {
    const copy = new ImageLayer({
      ...baseOptions,
      assetId: layer.assetId,
      geometry: cloneImageLayerGeometry(layer.geometry),
      image: layer.image,
      mimeType: layer.mimeType,
      objectUrl: layer.objectUrl,
      originalAssetId: layer.originalAssetId,
      originalImage: layer.originalImage,
      originalMimeType: layer.originalMimeType,
      originalObjectUrl: layer.originalObjectUrl
    });

    copy.hasWorkingImageChanges = layer.hasWorkingImageChanges;
    copy.revision = layer.revision;

    return copy;
  }

  if (layer instanceof GroupLayer) {
    return new GroupLayer({
      ...baseOptions,
      collapsed: layer.collapsed
    });
  }

  if (layer instanceof TextLayer) {
    const copy = new TextLayer({
      ...baseOptions,
      align: layer.align,
      bold: layer.bold,
      color: [...layer.color],
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      italic: layer.italic,
      text: layer.text
    });

    copy.lastResolvedCompiledFont = layer.lastResolvedCompiledFont;
    copy.lastTextCharacterBoxes = layer.lastTextCharacterBoxes.map((box) => ({ ...box }));
    copy.lastTextMaskFrame = layer.lastTextMaskFrame ? { ...layer.lastTextMaskFrame } : null;

    return copy;
  }

  if (layer instanceof AdjustmentLayer) {
    return new AdjustmentLayer(baseOptions);
  }

  if (layer instanceof StrokeLayer) {
    const copy = new StrokeLayer({
      ...baseOptions,
      color: [...layer.color],
      paths: layer.paths.map((path) => ({
        ...path,
        color: [...path.color],
        points: path.points.map((point) => ({ ...point })),
        selectionClip: path.selectionClip
          ? {
              ...path.selectionClip,
              bounds: { ...path.selectionClip.bounds },
              mask: path.selectionClip.mask
                ? {
                    data: new Uint8Array(path.selectionClip.mask.data),
                    height: path.selectionClip.mask.height,
                    width: path.selectionClip.mask.width
                  }
                : undefined,
              points: path.selectionClip.points?.map((point) => ({ ...point }))
            }
          : null
      })),
      strokeStyle: layer.strokeStyle,
      strokeWidth: layer.strokeWidth
    });

    copy.revision = layer.revision;

    return copy;
  }

  throw new Error(`Unsupported layer snapshot type: ${layer.type}`);
}

function cloneMaskForSnapshot(mask: LayerMask | null) {
  if (!mask) {
    return null;
  }

  const copy = new LayerMask({
    data: new Uint8Array(mask.data),
    enabled: mask.enabled,
    height: mask.height,
    id: mask.id,
    width: mask.width
  });

  copy.revision = mask.revision;

  return copy;
}

function areLayersEqual(left: Layer, right: Layer) {
  if (
    left.type !== right.type ||
    left.id !== right.id ||
    left.groupId !== right.groupId ||
    left.name !== right.name ||
    left.visible !== right.visible ||
    left.locked !== right.locked ||
    left.opacity !== right.opacity ||
    left.x !== right.x ||
    left.y !== right.y ||
    left.width !== right.width ||
    left.height !== right.height ||
    left.rotation !== right.rotation ||
    left.scaleX !== right.scaleX ||
    left.scaleY !== right.scaleY ||
    !areLayerFiltersEqual(left.filters, right.filters) ||
    !areMasksEqual(left.mask, right.mask)
  ) {
    return false;
  }

  if (left instanceof ShapeLayer && right instanceof ShapeLayer) {
    return (
      left.shape === right.shape &&
      left.strokeWidth === right.strokeWidth &&
      areColorArraysEqual(left.fillColor, right.fillColor) &&
      areColorArraysEqual(left.strokeColor, right.strokeColor)
    );
  }

  if (left instanceof ImageLayer && right instanceof ImageLayer) {
    return (
      left.assetId === right.assetId &&
      areImageLayerGeometriesEqual(left.geometry, right.geometry) &&
      left.mimeType === right.mimeType &&
      left.originalAssetId === right.originalAssetId &&
      left.originalMimeType === right.originalMimeType &&
      left.objectUrl === right.objectUrl &&
      left.originalObjectUrl === right.originalObjectUrl &&
      left.hasWorkingImageChanges === right.hasWorkingImageChanges &&
      left.revision === right.revision
    );
  }

  if (left instanceof GroupLayer && right instanceof GroupLayer) {
    return left.collapsed === right.collapsed;
  }

  if (left instanceof TextLayer && right instanceof TextLayer) {
    return (
      left.align === right.align &&
      left.bold === right.bold &&
      left.fontFamily === right.fontFamily &&
      left.fontSize === right.fontSize &&
      left.italic === right.italic &&
      left.text === right.text &&
      areColorArraysEqual(left.color, right.color)
    );
  }

  if (left instanceof AdjustmentLayer && right instanceof AdjustmentLayer) {
    return true;
  }

  if (left instanceof StrokeLayer && right instanceof StrokeLayer) {
    if (
      left.strokeStyle !== right.strokeStyle ||
      left.strokeWidth !== right.strokeWidth ||
      left.revision !== right.revision ||
      !areColorArraysEqual(left.color, right.color) ||
      left.paths.length !== right.paths.length
    ) {
      return false;
    }

    for (let index = 0; index < left.paths.length; index += 1) {
      const leftPath = left.paths[index];
      const rightPath = right.paths[index];

      if (
        leftPath.strokeStyle !== rightPath.strokeStyle ||
        leftPath.strokeWidth !== rightPath.strokeWidth ||
        !areColorArraysEqual(leftPath.color, rightPath.color) ||
        !arePathSelectionClipsEqual(leftPath.selectionClip ?? null, rightPath.selectionClip ?? null) ||
        leftPath.points.length !== rightPath.points.length
      ) {
        return false;
      }

      for (let pointIndex = 0; pointIndex < leftPath.points.length; pointIndex += 1) {
        const leftPoint = leftPath.points[pointIndex];
        const rightPoint = rightPath.points[pointIndex];

        if (leftPoint.x !== rightPoint.x || leftPoint.y !== rightPoint.y) {
          return false;
        }
      }
    }

    return true;
  }

  return false;
}

function areImageLayerGeometriesEqual(
  left: ImageLayer["geometry"],
  right: ImageLayer["geometry"]
) {
  return (
    left.crop.left === right.crop.left &&
    left.crop.right === right.crop.right &&
    left.crop.bottom === right.crop.bottom &&
    left.crop.top === right.crop.top &&
    left.corners.bottomLeft.x === right.corners.bottomLeft.x &&
    left.corners.bottomLeft.y === right.corners.bottomLeft.y &&
    left.corners.bottomRight.x === right.corners.bottomRight.x &&
    left.corners.bottomRight.y === right.corners.bottomRight.y &&
    left.corners.topLeft.x === right.corners.topLeft.x &&
    left.corners.topLeft.y === right.corners.topLeft.y &&
    left.corners.topRight.x === right.corners.topRight.x &&
    left.corners.topRight.y === right.corners.topRight.y
  );
}

function areMasksEqual(left: LayerMask | null, right: LayerMask | null) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (
    left.width !== right.width ||
    left.height !== right.height ||
    left.enabled !== right.enabled ||
    left.revision !== right.revision ||
    left.data.length !== right.data.length
  ) {
    return false;
  }

  for (let index = 0; index < left.data.length; index += 1) {
    if (left.data[index] !== right.data[index]) {
      return false;
    }
  }

  return true;
}

function areLayerFiltersEqual(
  left: Layer["filters"],
  right: Layer["filters"]
) {
  return (
    left.brightness === right.brightness &&
    left.blur === right.blur &&
    left.contrast === right.contrast &&
    left.dropShadowBlur === right.dropShadowBlur &&
    left.dropShadowOffsetX === right.dropShadowOffsetX &&
    left.dropShadowOffsetY === right.dropShadowOffsetY &&
    left.dropShadowOpacity === right.dropShadowOpacity &&
    left.grayscale === right.grayscale &&
    left.hue === right.hue &&
    left.invert === right.invert &&
    left.saturation === right.saturation &&
    left.sepia === right.sepia &&
    left.shadow === right.shadow
  );
}

function areColorArraysEqual(
  left: [number, number, number, number],
  right: [number, number, number, number]
) {
  return (
    left[0] === right[0] &&
    left[1] === right[1] &&
    left[2] === right[2] &&
    left[3] === right[3]
  );
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function areSelectionStatesEqual(left: SelectionManagerState, right: SelectionManagerState) {
  return (
    areSelectionEntriesEqual(left.current, right.current) &&
    areDraftSelectionEntriesEqual(left.draft, right.draft)
  );
}

function areSelectionEntriesEqual(
  left: SelectionManagerState["current"],
  right: SelectionManagerState["current"]
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.inverted === right.inverted &&
    left.shape === right.shape &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height &&
    left.featherRadius === right.featherRadius &&
    areSelectionPointsEqual(left.points, right.points) &&
    areSelectionMasksEqual(left.mask, right.mask)
  );
}

function areDraftSelectionEntriesEqual(
  left: SelectionManagerState["draft"],
  right: SelectionManagerState["draft"]
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.shape === right.shape &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height &&
    areSelectionPointsEqual(left.points, right.points)
  );
}

function areSelectionPointsEqual(
  left: SelectionPoint[] | undefined,
  right: SelectionPoint[] | undefined
) {
  if (left === right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((point, index) => point.x === right[index].x && point.y === right[index].y);
}

function areSelectionMasksEqual(
  left: SelectionMask | undefined,
  right: SelectionMask | undefined
) {
  if (left === right) {
    return true;
  }

  if (
    !left ||
    !right ||
    left.width !== right.width ||
    left.height !== right.height ||
    left.data.length !== right.data.length
  ) {
    return false;
  }

  for (let index = 0; index < left.data.length; index += 1) {
    if (left.data[index] !== right.data[index]) {
      return false;
    }
  }

  return true;
}

function arePathSelectionClipsEqual(
  left: StrokeLayer["paths"][number]["selectionClip"] | null,
  right: StrokeLayer["paths"][number]["selectionClip"] | null
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.coordinateSpace === right.coordinateSpace &&
    left.inverted === right.inverted &&
    left.shape === right.shape &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height &&
    areSelectionPointsEqual(left.points, right.points) &&
    areSelectionMasksEqual(left.mask, right.mask)
  );
}
