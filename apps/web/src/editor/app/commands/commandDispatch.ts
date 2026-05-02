import type {
  DocumentCommand,
  ImageLayerCommand,
  LayerCommand,
  SelectionCommand
} from "../EditorApp";
import { Scene } from "../../scene/Scene";

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
    case "move-down":
      return scene.moveLayerBackward(command.layerId);
    case "move-up":
      return scene.moveLayerForward(command.layerId);
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
