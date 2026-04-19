import type { Layer } from "../layers/Layer";
import { ensureLayerMaskResolution } from "../masks/LayerMaskResolution";
import { getModelMatrix } from "../geometry/TransformGeometry";
import { transformPoint3x3 } from "../geometry/Matrix3";

export type SelectionShape = "ellipse" | "rectangle";

export type SelectionBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type Selection = {
  bounds: SelectionBounds;
  inverted: boolean;
  shape: SelectionShape;
};

export type SelectionDraft = {
  bounds: SelectionBounds;
  shape: SelectionShape;
};

export type SelectionSnapshot = Selection & {
  isDraft: boolean;
};

export class SelectionManager {
  private currentSelection: Selection | null = null;
  private draftSelection: SelectionDraft | null = null;

  get current() {
    return this.currentSelection;
  }

  get draft() {
    return this.draftSelection;
  }

  get visibleSelection(): SelectionSnapshot | null {
    if (this.draftSelection) {
      return {
        ...this.draftSelection,
        inverted: false,
        isDraft: true
      };
    }

    return this.currentSelection
      ? {
          ...this.currentSelection,
          isDraft: false
        }
      : null;
  }

  clear() {
    this.currentSelection = null;
    this.draftSelection = null;
  }

  invert() {
    if (!this.currentSelection) {
      return false;
    }

    this.currentSelection = {
      ...this.currentSelection,
      inverted: !this.currentSelection.inverted
    };

    return true;
  }

  setDraft(shape: SelectionShape, bounds: SelectionBounds) {
    this.draftSelection = {
      bounds: normalizeBounds(bounds),
      shape
    };
  }

  commitDraft(minSize = 1) {
    if (!this.draftSelection) {
      return null;
    }

    const shape = this.draftSelection.shape;
    const bounds = normalizeBounds(this.draftSelection.bounds);

    this.draftSelection = null;

    if (bounds.width < minSize || bounds.height < minSize) {
      this.currentSelection = null;
      return null;
    }

    this.currentSelection = {
      bounds,
      inverted: false,
      shape
    };

    return this.currentSelection;
  }

  commit(shape: SelectionShape, bounds: SelectionBounds, minSize = 1) {
    const normalizedBounds = normalizeBounds(bounds);
    this.draftSelection = null;

    if (normalizedBounds.width < minSize || normalizedBounds.height < minSize) {
      this.currentSelection = null;
      return null;
    }

    this.currentSelection = {
      bounds: normalizedBounds,
      inverted: false,
      shape
    };

    return this.currentSelection;
  }

  cancelDraft() {
    this.draftSelection = null;
  }

  containsWorldPoint(x: number, y: number) {
    if (!this.currentSelection) {
      return true;
    }

    return containsSelectionPoint(this.currentSelection, x, y);
  }

  convertToLayerMask(layer: Layer) {
    const selection = this.currentSelection;

    if (!selection) {
      return false;
    }

    const mask = ensureLayerMaskResolution(layer);
    const modelMatrix = getModelMatrix(layer);

    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        const localX = mask.width <= 1 ? 0 : (x + 0.5) / mask.width;
        const localY = mask.height <= 1 ? 0 : 1 - (y + 0.5) / mask.height;
        const worldPoint = transformPoint3x3(modelMatrix, localX, localY);
        const pixelIndex = y * mask.width + x;

        mask.data[pixelIndex] = containsSelectionPoint(selection, worldPoint.x, worldPoint.y)
          ? 255
          : 0;
      }
    }

    mask.enabled = true;
    mask.revision += 1;

    return true;
  }
}

export function normalizeBounds(bounds: SelectionBounds): SelectionBounds {
  const x = Math.min(bounds.x, bounds.x + bounds.width);
  const y = Math.min(bounds.y, bounds.y + bounds.height);

  return {
    height: Math.abs(bounds.height),
    width: Math.abs(bounds.width),
    x,
    y
  };
}

export function containsSelectionPoint(selection: Selection, x: number, y: number) {
  const bounds = selection.bounds;
  const insideBounds =
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height;
  let insideShape = insideBounds;

  if (insideBounds && selection.shape === "ellipse") {
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;
    const centerX = bounds.x + radiusX;
    const centerY = bounds.y + radiusY;
    const normalizedX = radiusX > 0 ? (x - centerX) / radiusX : 0;
    const normalizedY = radiusY > 0 ? (y - centerY) / radiusY : 0;

    insideShape = normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  }

  return selection.inverted ? !insideShape : insideShape;
}
