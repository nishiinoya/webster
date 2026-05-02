import type {
  DocumentCommand,
  ImageLayerCommand,
  LayerCommand,
  SelectionCommand
} from "../EditorApp";
import { Scene } from "../../scene/Scene";
import type { Selection } from "../../selection/SelectionManager";

/**
 * Applies a layer command to the scene and returns the command result.
 */
export function applyLayerCommandToScene(scene: Scene, command: LayerCommand) {
  switch (command.type) {
    case "add-adjustment":
      return scene.addAdjustmentLayer();
    case "delete":
      return scene.removeLayer(command.layerId);
    case "duplicate":
      return scene.duplicateLayer(command.layerId);
    case "group":
      return scene.groupLayers(command.layerIds, command.name);
    case "mask":
      return scene.updateLayerMask(command.layerId, command.action);
    case "move-to-position":
      return scene.moveLayersToPosition(
        command.layerIds,
        command.targetLayerId,
        command.placement
      );
    case "move-down":
      return scene.moveLayerBackward(command.layerId);
    case "move-up":
      return scene.moveLayerForward(command.layerId);
    case "remove-from-group":
      return scene.removeLayersFromGroup(command.layerIds);
    case "select":
      return scene.selectLayer(command.layerId);
    case "update":
      return scene.updateLayer(command.layerId, command.updates);
  }
}

/**
 * Applies a document command and lets the caller react to document-bound changes.
 */
export function applyDocumentCommandToScene(
  scene: Scene,
  command: DocumentCommand,
  onDocumentChanged: (document: Scene["document"]) => void
) {
  if (command.type === "resize") {
    const document = scene.resizeDocument(command.width, command.height, command.anchor);

    onDocumentChanged(document);

    return document;
  }
}

/**
 * Routes an image-layer command to the async image operation handlers.
 */
export async function applyImageLayerCommandToScene(
  command: ImageLayerCommand,
  handlers: {
    resampleImageLayer: (layerId: string, width: number, height: number) => Promise<unknown>;
    restoreOriginalImageLayer: (layerId: string) => unknown;
  }
) {
  if (command.type === "resample") {
    return handlers.resampleImageLayer(command.layerId, command.width, command.height);
  }

  return handlers.restoreOriginalImageLayer(command.layerId);
}

/**
 * Applies a selection command and returns whether it changed selection state.
 */
export function applySelectionCommandToScene(scene: Scene, command: SelectionCommand) {
  if (typeof command !== "string") {
    if (command.type === "feather") {
      return scene.selection.feather(command.radius);
    }

    if (command.type === "grow") {
      return scene.selection.grow(command.amount);
    }

    if (command.type === "shrink") {
      return scene.selection.grow(-command.amount);
    }

    if (command.type === "save") {
      return saveSelection(command.name, scene.selection.current);
    }

    if (command.type === "load") {
      const selection = loadSelection(command.name);

      if (!selection) {
        return false;
      }

      scene.selection.restoreSelection(selection, command.mode ?? "replace");
      return true;
    }
  }

  if (command === "clear") {
    scene.selection.clear();
    return true;
  }

  if (command === "invert") {
    return scene.selection.invert();
  }

  const layer = scene.selectedLayerId ? scene.getLayer(scene.selectedLayerId) : null;

  if (command === "convert-to-mask" && layer && !layer.locked) {
    return scene.selection.convertToLayerMask(layer);
  }

  return false;
}

const savedSelectionsStorageKey = "webster.savedSelections";

type StoredSelection = Omit<Selection, "mask" | "points"> & {
  mask?: {
    data: number[];
    height: number;
    width: number;
  };
  points?: Array<{ x: number; y: number }>;
};

function saveSelection(name: string, selection: Selection | null) {
  if (!selection) {
    return false;
  }

  const trimmedName = name.trim();

  if (!trimmedName) {
    return false;
  }

  const selections = readSavedSelections();

  selections[trimmedName] = serializeSelection(selection);
  window.localStorage.setItem(savedSelectionsStorageKey, JSON.stringify(selections));

  return true;
}

function loadSelection(name: string) {
  const storedSelection = readSavedSelections()[name.trim()];

  return storedSelection ? deserializeSelection(storedSelection) : null;
}

function readSavedSelections() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(savedSelectionsStorageKey) ?? "{}");

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, StoredSelection>)
      : {};
  } catch {
    return {};
  }
}

function serializeSelection(selection: Selection): StoredSelection {
  return {
    bounds: { ...selection.bounds },
    featherRadius: selection.featherRadius,
    inverted: selection.inverted,
    mask: selection.mask
      ? {
          data: Array.from(selection.mask.data),
          height: selection.mask.height,
          width: selection.mask.width
        }
      : undefined,
    points: selection.points?.map((point) => ({ ...point })),
    shape: selection.shape
  };
}

function deserializeSelection(selection: StoredSelection): Selection | null {
  if (!selection?.bounds || typeof selection.shape !== "string") {
    return null;
  }

  return {
    bounds: {
      height: Number(selection.bounds.height) || 1,
      width: Number(selection.bounds.width) || 1,
      x: Number(selection.bounds.x) || 0,
      y: Number(selection.bounds.y) || 0
    },
    featherRadius: selection.featherRadius,
    inverted: Boolean(selection.inverted),
    mask: selection.mask
      ? {
          data: new Uint8Array(selection.mask.data),
          height: selection.mask.height,
          width: selection.mask.width
        }
      : undefined,
    points: selection.points?.map((point) => ({
      x: Number(point.x) || 0,
      y: Number(point.y) || 0
    })),
    shape: selection.shape
  };
}
