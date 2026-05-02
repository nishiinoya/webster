/** Scene selection state, draft selection state, and selection-to-mask helpers. */
import type { Layer } from "../layers/Layer";
import { ensureLayerMaskResolution } from "../masks/LayerMaskResolution";
import { getModelMatrix } from "../geometry/TransformGeometry";
import { transformPoint3x3 } from "../geometry/Matrix3";

export type SelectionMode = "add" | "intersect" | "replace" | "subtract";

export type SelectionShape = "ellipse" | "lasso" | "mask" | "rectangle";

export type SelectionBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type SelectionPoint = {
  x: number;
  y: number;
};

export type SelectionMask = {
  data: Uint8Array;
  height: number;
  width: number;
};

export type Selection = {
  bounds: SelectionBounds;
  featherRadius?: number;
  inverted: boolean;
  mask?: SelectionMask;
  points?: SelectionPoint[];
  shape: SelectionShape;
};

export type SelectionDraft = {
  bounds: SelectionBounds;
  points?: SelectionPoint[];
  shape: SelectionShape;
};

export type SelectionManagerState = {
  current: Selection | null;
  draft: SelectionDraft | null;
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

  getSnapshot(): SelectionManagerState {
    return cloneSelectionManagerState({
      current: this.currentSelection,
      draft: this.draftSelection
    });
  }

  restoreSnapshot(snapshot: SelectionManagerState) {
    const nextSnapshot = cloneSelectionManagerState(snapshot);

    this.currentSelection = nextSnapshot.current;
    this.draftSelection = nextSnapshot.draft;
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

  setDraft(shape: SelectionShape, bounds: SelectionBounds, points?: SelectionPoint[]) {
    this.draftSelection = {
      bounds: normalizeBounds(bounds),
      points: points?.map((point) => ({ ...point })),
      shape
    };
  }

  commitDraft(minSize = 1, mode: SelectionMode = "replace") {
    if (!this.draftSelection) {
      return null;
    }

    const shape = this.draftSelection.shape;
    const bounds = normalizeBounds(this.draftSelection.bounds);
    const points = this.draftSelection.points?.map((point) => ({ ...point }));

    this.draftSelection = null;

    if (shape === "lasso" && points) {
      return this.commitLasso(points, minSize, mode);
    }

    if (bounds.width < minSize || bounds.height < minSize) {
      this.currentSelection = null;
      return null;
    }

    const selection: Selection = {
      bounds,
      inverted: false,
      shape
    };

    this.applySelection(selection, mode);

    return this.currentSelection;
  }

  commit(
    shape: SelectionShape,
    bounds: SelectionBounds,
    minSize = 1,
    mode: SelectionMode = "replace"
  ) {
    const normalizedBounds = normalizeBounds(bounds);
    this.draftSelection = null;

    if (normalizedBounds.width < minSize || normalizedBounds.height < minSize) {
      this.currentSelection = null;
      return null;
    }

    this.applySelection({
      bounds: normalizedBounds,
      inverted: false,
      shape
    }, mode);

    return this.currentSelection;
  }

  commitLasso(points: SelectionPoint[], minSize = 1, mode: SelectionMode = "replace") {
    this.draftSelection = null;

    const normalizedPoints = simplifySelectionPoints(points).map((point) => ({ ...point }));
    const bounds = getPointBounds(normalizedPoints);

    if (!bounds || normalizedPoints.length < 3 || bounds.width < minSize || bounds.height < minSize) {
      this.currentSelection = null;
      return null;
    }

    this.applySelection(
      {
        bounds,
        inverted: false,
        points: normalizedPoints,
        shape: "lasso"
      },
      mode
    );

    return this.currentSelection;
  }

  commitMask(
    bounds: SelectionBounds,
    width: number,
    height: number,
    data: Uint8Array,
    mode: SelectionMode = "replace"
  ) {
    const normalizedBounds = normalizeBounds(bounds);
    const maskWidth = Math.max(1, Math.round(width));
    const maskHeight = Math.max(1, Math.round(height));
    const expectedLength = maskWidth * maskHeight;

    this.draftSelection = null;

    if (
      normalizedBounds.width < 1 ||
      normalizedBounds.height < 1 ||
      data.length < expectedLength ||
      !data.some((value) => value > 0)
    ) {
      this.currentSelection = null;
      return null;
    }

    this.applySelection(
      {
        bounds: normalizedBounds,
        inverted: false,
        mask: {
          data: data.slice(0, expectedLength),
          height: maskHeight,
          width: maskWidth
        },
        shape: "mask"
      },
      mode
    );

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

        mask.data[pixelIndex] = getSelectionAlpha(selection, worldPoint.x, worldPoint.y);
      }
    }

    mask.enabled = true;
    mask.markDirty();

    return true;
  }

  feather(radius: number) {
    const selection = this.currentSelection;
    const featherRadius = Math.max(0, Math.round(radius));

    if (!selection || featherRadius <= 0) {
      return false;
    }

    const maskSelection = selectionToMaskSelection(selection);
    const pixelRadius = Math.max(
      1,
      Math.round(featherRadius * getMaskPixelsPerWorldUnit(maskSelection))
    );

    maskSelection.mask.data = boxBlurMask(
      maskSelection.mask.data,
      maskSelection.mask.width,
      maskSelection.mask.height,
      pixelRadius
    );
    maskSelection.featherRadius = featherRadius;
    this.currentSelection = maskSelection;

    return true;
  }

  grow(amount: number) {
    const selection = this.currentSelection;
    const growAmount = Math.round(amount);

    if (!selection || growAmount === 0) {
      return false;
    }

    const expandedBounds = growAmount > 0
      ? expandBounds(selection.bounds, growAmount)
      : { ...selection.bounds };
    const maskSelection = selectionToMaskSelection(selection, expandedBounds);
    const pixelRadius = Math.max(
      1,
      Math.round(Math.abs(growAmount) * getMaskPixelsPerWorldUnit(maskSelection))
    );

    maskSelection.mask.data =
      growAmount > 0
        ? maxFilterMask(maskSelection.mask.data, maskSelection.mask.width, maskSelection.mask.height, pixelRadius)
        : minFilterMask(maskSelection.mask.data, maskSelection.mask.width, maskSelection.mask.height, pixelRadius);
    this.currentSelection = trimEmptyMaskSelection(maskSelection) ?? maskSelection;

    return true;
  }

  restoreSelection(selection: Selection, mode: SelectionMode = "replace") {
    this.draftSelection = null;
    this.applySelection(cloneSelection(selection), mode);

    return this.currentSelection;
  }

  private applySelection(selection: Selection, mode: SelectionMode) {
    if (mode === "replace" || !this.currentSelection) {
      this.currentSelection = cloneSelection(selection);
      return;
    }

    const combinedBounds =
      mode === "intersect"
        ? intersectBounds(this.currentSelection.bounds, selection.bounds)
        : unionBounds(this.currentSelection.bounds, selection.bounds);

    if (!combinedBounds) {
      this.currentSelection = null;
      return;
    }

    const size = getSelectionRasterSize(combinedBounds);
    const currentData = rasterizeSelection(this.currentSelection, combinedBounds, size.width, size.height);
    const nextData = rasterizeSelection(selection, combinedBounds, size.width, size.height);
    const combinedData = new Uint8Array(currentData.length);

    for (let index = 0; index < combinedData.length; index += 1) {
      const currentAlpha = currentData[index];
      const nextAlpha = nextData[index];

      if (mode === "add") {
        combinedData[index] = Math.max(currentAlpha, nextAlpha);
      } else if (mode === "subtract") {
        combinedData[index] = Math.round(currentAlpha * (1 - nextAlpha / 255));
      } else {
        combinedData[index] = Math.min(currentAlpha, nextAlpha);
      }
    }

    if (!combinedData.some((value) => value > 0)) {
      this.currentSelection = null;
      return;
    }

    this.currentSelection = {
      bounds: combinedBounds,
      inverted: false,
      mask: {
        data: combinedData,
        height: size.height,
        width: size.width
      },
      shape: "mask"
    };
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

export function cloneSelectionManagerState(state: SelectionManagerState): SelectionManagerState {
  return {
    current: state.current ? cloneSelection(state.current) : null,
    draft: state.draft ? cloneSelectionDraft(state.draft) : null
  };
}

export function containsSelectionPoint(selection: Selection, x: number, y: number) {
  return getSelectionAlpha(selection, x, y) > 0;
}

export function getSelectionAlpha(selection: Selection, x: number, y: number) {
  const bounds = selection.bounds;
  const insideBounds =
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height;
  let alpha = insideBounds ? 255 : 0;

  if (selection.shape === "mask" && selection.mask) {
    alpha = sampleSelectionMask(selection, x, y);
  } else if (insideBounds && selection.shape === "ellipse") {
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;
    const centerX = bounds.x + radiusX;
    const centerY = bounds.y + radiusY;
    const normalizedX = radiusX > 0 ? (x - centerX) / radiusX : 0;
    const normalizedY = radiusY > 0 ? (y - centerY) / radiusY : 0;

    alpha = normalizedX * normalizedX + normalizedY * normalizedY <= 1 ? 255 : 0;
  } else if (insideBounds && selection.shape === "lasso" && selection.points) {
    alpha = isPointInPolygon({ x, y }, selection.points) ? 255 : 0;
  }

  return selection.inverted ? 255 - alpha : alpha;
}

export function getSelectionRasterSize(bounds: SelectionBounds) {
  const maxPixelArea = 2_000_000;
  const safeWidth = Math.max(1, bounds.width);
  const safeHeight = Math.max(1, bounds.height);
  const scale = Math.min(
    1,
    2048 / safeWidth,
    2048 / safeHeight,
    Math.sqrt(maxPixelArea / (safeWidth * safeHeight))
  );

  return {
    height: Math.max(1, Math.round(safeHeight * scale)),
    width: Math.max(1, Math.round(safeWidth * scale))
  };
}

function cloneSelection(selection: Selection): Selection {
  return {
    bounds: { ...selection.bounds },
    featherRadius: selection.featherRadius,
    inverted: selection.inverted,
    mask: selection.mask
      ? {
          data: new Uint8Array(selection.mask.data),
          height: selection.mask.height,
          width: selection.mask.width
        }
      : undefined,
    points: selection.points?.map((point) => ({ ...point })),
    shape: selection.shape
  };
}

function cloneSelectionDraft(selection: SelectionDraft): SelectionDraft {
  return {
    bounds: { ...selection.bounds },
    points: selection.points?.map((point) => ({ ...point })),
    shape: selection.shape
  };
}

function sampleSelectionMask(selection: Selection, x: number, y: number) {
  const mask = selection.mask;

  if (!mask) {
    return 0;
  }

  const bounds = selection.bounds;
  const normalizedX = bounds.width > 0 ? (x - bounds.x) / bounds.width : 0;
  const normalizedY = bounds.height > 0 ? (y - bounds.y) / bounds.height : 0;

  if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
    return 0;
  }

  const maskX = Math.min(mask.width - 1, Math.max(0, Math.floor(normalizedX * mask.width)));
  const maskY = Math.min(
    mask.height - 1,
    Math.max(0, Math.floor(normalizedY * mask.height))
  );

  return mask.data[maskY * mask.width + maskX] ?? 0;
}

function rasterizeSelection(
  selection: Selection,
  bounds: SelectionBounds,
  width: number,
  height: number
) {
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const worldY = bounds.y + ((y + 0.5) / height) * bounds.height;

    for (let x = 0; x < width; x += 1) {
      const worldX = bounds.x + ((x + 0.5) / width) * bounds.width;

      data[y * width + x] = getSelectionAlpha(selection, worldX, worldY);
    }
  }

  return data;
}

function selectionToMaskSelection(selection: Selection, bounds = selection.bounds): Selection & { mask: SelectionMask } {
  const normalizedBounds = normalizeBounds(bounds);
  const size = getSelectionRasterSize(normalizedBounds);
  const data = rasterizeSelection(selection, normalizedBounds, size.width, size.height);

  return {
    bounds: normalizedBounds,
    inverted: false,
    mask: {
      data,
      height: size.height,
      width: size.width
    },
    shape: "mask"
  };
}

function getMaskPixelsPerWorldUnit(selection: Selection & { mask: SelectionMask }) {
  return Math.max(
    selection.mask.width / Math.max(1, selection.bounds.width),
    selection.mask.height / Math.max(1, selection.bounds.height)
  );
}

function boxBlurMask(data: Uint8Array, width: number, height: number, radius: number) {
  const temp = new Uint8Array(data.length);
  const output = new Uint8Array(data.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;

      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = x + offset;

        if (sampleX < 0 || sampleX >= width) {
          continue;
        }

        sum += data[y * width + sampleX];
        count += 1;
      }

      temp[y * width + x] = Math.round(sum / Math.max(1, count));
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;

      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = y + offset;

        if (sampleY < 0 || sampleY >= height) {
          continue;
        }

        sum += temp[sampleY * width + x];
        count += 1;
      }

      output[y * width + x] = Math.round(sum / Math.max(1, count));
    }
  }

  return output;
}

function maxFilterMask(data: Uint8Array, width: number, height: number, radius: number) {
  return filterMask(data, width, height, radius, Math.max, 0, 0);
}

function minFilterMask(data: Uint8Array, width: number, height: number, radius: number) {
  return filterMask(data, width, height, radius, Math.min, 255, 0);
}

function filterMask(
  data: Uint8Array,
  width: number,
  height: number,
  radius: number,
  reducer: (...values: number[]) => number,
  initialValue: number,
  outOfBoundsValue: number
) {
  const temp = new Uint8Array(data.length);
  const output = new Uint8Array(data.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = initialValue;

      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = x + offset;

        value = reducer(
          value,
          sampleX >= 0 && sampleX < width ? data[y * width + sampleX] : outOfBoundsValue
        );
      }

      temp[y * width + x] = value;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = initialValue;

      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = y + offset;

        value = reducer(
          value,
          sampleY >= 0 && sampleY < height ? temp[sampleY * width + x] : outOfBoundsValue
        );
      }

      output[y * width + x] = value;
    }
  }

  return output;
}

function trimEmptyMaskSelection(selection: Selection & { mask: SelectionMask }) {
  if (selection.mask.data.some((value) => value > 0)) {
    return selection;
  }

  return null;
}

function unionBounds(left: SelectionBounds, right: SelectionBounds): SelectionBounds {
  const minX = Math.min(left.x, right.x);
  const minY = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);

  return {
    height: Math.max(1, maxY - minY),
    width: Math.max(1, maxX - minX),
    x: minX,
    y: minY
  };
}

function intersectBounds(left: SelectionBounds, right: SelectionBounds): SelectionBounds | null {
  const minX = Math.max(left.x, right.x);
  const minY = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);

  if (maxX <= minX || maxY <= minY) {
    return null;
  }

  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY
  };
}

function expandBounds(bounds: SelectionBounds, amount: number): SelectionBounds {
  return {
    height: Math.max(1, bounds.height + amount * 2),
    width: Math.max(1, bounds.width + amount * 2),
    x: bounds.x - amount,
    y: bounds.y - amount
  };
}

function getPointBounds(points: SelectionPoint[]) {
  if (points.length === 0) {
    return null;
  }

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

function simplifySelectionPoints(points: SelectionPoint[]) {
  const minimumPointDistance = 1;
  const simplifiedByDistance: SelectionPoint[] = [];

  for (const point of points) {
    const previousPoint = simplifiedByDistance.at(-1);

    if (
      !previousPoint ||
      Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) >= minimumPointDistance
    ) {
      simplifiedByDistance.push(point);
    }
  }

  if (simplifiedByDistance.length <= 3) {
    return simplifiedByDistance;
  }

  return limitSelectionPointCount(
    simplifyDouglasPeucker(simplifiedByDistance, 1.25),
    1600
  );
}

function simplifyDouglasPeucker(points: SelectionPoint[], tolerance: number) {
  if (points.length <= 2) {
    return points;
  }

  const toleranceSquared = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  const ranges: Array<{ end: number; start: number }> = [
    {
      end: points.length - 1,
      start: 0
    }
  ];

  keep[0] = 1;
  keep[points.length - 1] = 1;

  while (ranges.length > 0) {
    const range = ranges.pop();

    if (!range || range.end <= range.start + 1) {
      continue;
    }

    let bestDistance = 0;
    let bestIndex = -1;

    for (let index = range.start + 1; index < range.end; index += 1) {
      const distanceSquared = getPointSegmentDistanceSquared(
        points[index],
        points[range.start],
        points[range.end]
      );

      if (distanceSquared > bestDistance) {
        bestDistance = distanceSquared;
        bestIndex = index;
      }
    }

    if (bestIndex === -1 || bestDistance <= toleranceSquared) {
      continue;
    }

    keep[bestIndex] = 1;
    ranges.push({ end: bestIndex, start: range.start });
    ranges.push({ end: range.end, start: bestIndex });
  }

  return points.filter((_, index) => keep[index] === 1);
}

function limitSelectionPointCount(points: SelectionPoint[], maxPointCount: number) {
  if (points.length <= maxPointCount) {
    return points;
  }

  const result: SelectionPoint[] = [];
  const stride = (points.length - 1) / Math.max(1, maxPointCount - 1);
  let previousIndex = -1;

  for (let index = 0; index < maxPointCount - 1; index += 1) {
    const pointIndex = Math.min(points.length - 1, Math.round(index * stride));

    if (pointIndex !== previousIndex) {
      result.push(points[pointIndex]);
      previousIndex = pointIndex;
    }
  }

  result.push(points[points.length - 1]);

  return result;
}

function getPointSegmentDistanceSquared(
  point: SelectionPoint,
  start: SelectionPoint,
  end: SelectionPoint
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 1e-9) {
    const pointDx = point.x - start.x;
    const pointDy = point.y - start.y;

    return pointDx * pointDx + pointDy * pointDy;
  }

  const amount = Math.min(
    1,
    Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
  const closestX = start.x + dx * amount;
  const closestY = start.y + dy * amount;
  const distanceX = point.x - closestX;
  const distanceY = point.y - closestY;

  return distanceX * distanceX + distanceY * distanceY;
}

function isPointInPolygon(point: SelectionPoint, points: SelectionPoint[]) {
  let isInside = false;

  for (let index = 0, previousIndex = points.length - 1; index < points.length; previousIndex = index++) {
    const current = points[index];
    const previous = points[previousIndex];
    const deltaY = previous.y - current.y;
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (Math.abs(deltaY) > 1e-9 ? deltaY : 1e-9) +
          current.x;

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}
