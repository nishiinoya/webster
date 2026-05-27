import { Camera2D } from "../../geometry/Camera2D";
import { Scene } from "../../scene/Scene";
import { TextLayer } from "../../layers/TextLayer";

export type TextSelectionRange = {
  end: number;
  start: number;
};

export type TextEditingState = {
  caretIndex: number;
  layerId: string | null;
  selectionEnd: number | null;
  selectionStart: number | null;
};

/**
 * Ends text editing and clears any active caret or selection state.
 */
export function finishTextEdit(state: TextEditingState) {
  state.layerId = null;
  state.caretIndex = 0;
  clearTextSelection(state);
}

/**
 * Clears the current text selection while leaving the active edit layer intact.
 */
export function clearTextSelection(state: TextEditingState) {
  state.selectionStart = null;
  state.selectionEnd = null;
}

/**
 * Resolves the currently edited text layer, ending edit mode if the layer no longer exists.
 */
export function getActiveTextEditLayer(scene: Scene, state: TextEditingState) {
  if (!state.layerId) {
    return null;
  }

  const layer = scene.getLayer(state.layerId);

  if (!(layer instanceof TextLayer)) {
    finishTextEdit(state);
    return null;
  }

  return layer;
}

/**
 * Starts text editing at a client point, reusing an existing text layer or creating a new one.
 */
export function startTextEditAtClientPoint(input: {
  camera: Camera2D;
  getCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number };
  scene: Scene;
  state: TextEditingState;
  clientX: number;
  clientY: number;
}) {
  const screenPoint = input.getCanvasPoint(input.clientX, input.clientY);
  const worldPoint = input.camera.screenToWorld(screenPoint.x, screenPoint.y);
  const layer = input.scene.hitTestLayer(worldPoint.x, worldPoint.y);

  if (layer instanceof TextLayer) {
    input.scene.selectLayer(layer.id);
    input.state.layerId = layer.id;
    input.state.caretIndex = layer.text.length;
    clearTextSelection(input.state);

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

  input.scene.addLayer(nextLayer);
  input.state.layerId = nextLayer.id;
  input.state.caretIndex = 0;
  clearTextSelection(input.state);

  return nextLayer;
}

/**
 * Starts a drag text selection from the text index nearest to the client point.
 */
export function startTextSelectionAtClientPoint(input: {
  camera: Camera2D;
  getCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number };
  scene: Scene;
  state: TextEditingState;
  clientX: number;
  clientY: number;
}) {
  const layer = startTextEditAtClientPoint(input);

  if (!layer) {
    return false;
  }

  const index = getTextIndexAtClientPoint(
    layer,
    input.clientX,
    input.clientY,
    input.camera,
    input.getCanvasPoint
  );

  input.state.caretIndex = index;
  input.state.selectionStart = index;
  input.state.selectionEnd = index;

  return true;
}

/**
 * Updates the trailing edge of the current text selection from a client point.
 */
export function updateTextSelectionAtClientPoint(input: {
  camera: Camera2D;
  getCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number };
  scene: Scene;
  state: TextEditingState;
  clientX: number;
  clientY: number;
}) {
  const layer = getActiveTextEditLayer(input.scene, input.state);

  if (!layer || input.state.selectionStart === null) {
    return false;
  }

  input.state.selectionEnd = getTextIndexAtClientPoint(
    layer,
    input.clientX,
    input.clientY,
    input.camera,
    input.getCanvasPoint
  );
  input.state.caretIndex = input.state.selectionEnd;

  return true;
}

/**
 * Returns whether a text selection drag had an active anchor.
 */
export function endTextSelection(state: TextEditingState) {
  return state.selectionStart !== null;
}

/**
 * Inserts text into the active text layer, replacing the current selection when present.
 */
export function insertTextInput(scene: Scene, state: TextEditingState, text: string) {
  const layer = getActiveTextEditLayer(scene, state);

  if (!layer || layer.locked || !text) {
    return false;
  }

  const selection = getTextSelectionRange(layer, state);
  const insertStart = selection?.start ?? state.caretIndex;
  const insertEnd = selection?.end ?? state.caretIndex;

  layer.text = layer.text.slice(0, insertStart) + text + layer.text.slice(insertEnd);
  state.caretIndex = insertStart + text.length;
  clearTextSelection(state);

  return true;
}

/**
 * Deletes one character backward or removes the current text selection.
 */
export function deleteTextBackward(scene: Scene, state: TextEditingState) {
  const layer = getActiveTextEditLayer(scene, state);

  if (!layer || layer.locked) {
    return false;
  }

  const selection = getTextSelectionRange(layer, state);

  if (selection) {
    layer.text = layer.text.slice(0, selection.start) + layer.text.slice(selection.end);
    state.caretIndex = selection.start;
    clearTextSelection(state);
    return true;
  }

  if (state.caretIndex <= 0) {
    return false;
  }

  layer.text = layer.text.slice(0, state.caretIndex - 1) + layer.text.slice(state.caretIndex);
  state.caretIndex -= 1;
  clearTextSelection(state);

  return true;
}

/**
 * Deletes one character forward or removes the current text selection.
 */
export function deleteTextForward(scene: Scene, state: TextEditingState) {
  const layer = getActiveTextEditLayer(scene, state);

  if (!layer || layer.locked) {
    return false;
  }

  const selection = getTextSelectionRange(layer, state);

  if (selection) {
    layer.text = layer.text.slice(0, selection.start) + layer.text.slice(selection.end);
    state.caretIndex = selection.start;
    clearTextSelection(state);
    return true;
  }

  if (state.caretIndex >= layer.text.length) {
    return false;
  }

  layer.text = layer.text.slice(0, state.caretIndex) + layer.text.slice(state.caretIndex + 1);
  clearTextSelection(state);

  return true;
}

/**
 * Returns the currently selected text content when an edit selection exists.
 */
export function getSelectedTextInput(scene: Scene, state: TextEditingState) {
  const layer = getActiveTextEditLayer(scene, state);

  if (!layer) {
    return null;
  }

  const selection = getTextSelectionRange(layer, state);

  return selection ? layer.text.slice(selection.start, selection.end) : null;
}

/**
 * Selects the full contents of the active text layer.
 */
export function selectAllTextInput(scene: Scene, state: TextEditingState) {
  const layer = getActiveTextEditLayer(scene, state);

  if (!layer) {
    return false;
  }

  state.selectionStart = 0;
  state.selectionEnd = layer.text.length;
  state.caretIndex = layer.text.length;

  return true;
}

/**
 * Moves the caret within the active text layer and clears the current selection.
 */
export function moveTextCaret(
  scene: Scene,
  state: TextEditingState,
  direction: "end" | "home" | "left" | "right"
) {
  const layer = getActiveTextEditLayer(scene, state);

  if (!layer) {
    return false;
  }

  if (direction === "home") {
    state.caretIndex = 0;
    clearTextSelection(state);
    return true;
  }

  if (direction === "end") {
    state.caretIndex = layer.text.length;
    clearTextSelection(state);
    return true;
  }

  if (direction === "left") {
    state.caretIndex = Math.max(0, state.caretIndex - 1);
    clearTextSelection(state);
    return true;
  }

  state.caretIndex = Math.min(layer.text.length, state.caretIndex + 1);
  clearTextSelection(state);

  return true;
}

/**
 * Creates the default text layer used by toolbar and quick-add flows.
 */
export function createDefaultTextLayer() {
  return new TextLayer({
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
}

function getTextIndexAtClientPoint(
  layer: TextLayer,
  clientX: number,
  clientY: number,
  camera: Camera2D,
  getCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number }
) {
  const screenPoint = getCanvasPoint(clientX, clientY);
  const worldPoint = camera.screenToWorld(screenPoint.x, screenPoint.y);
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
      localX < box.x ? box.x - localX : localX > box.x + box.width ? localX - (box.x + box.width) : 0;
    const distance = lineDistance * 4 + xDistance;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = xIndex;
    }
  }

  return Math.max(0, Math.min(layer.text.length, nearestIndex));
}

function getTextSelectionRange(layer: TextLayer, state: TextEditingState): TextSelectionRange | null {
  if (state.selectionStart === null || state.selectionEnd === null) {
    return null;
  }

  const start = Math.max(0, Math.min(layer.text.length, state.selectionStart));
  const end = Math.max(0, Math.min(layer.text.length, state.selectionEnd));

  if (start === end) {
    return null;
  }

  return {
    end: Math.max(start, end),
    start: Math.min(start, end)
  };
}
