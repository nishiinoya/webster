import { transformPoint3x3 } from "../geometry/Matrix3";
import { getModelMatrix } from "../geometry/TransformGeometry";
import { Layer } from "./Layer";
import type { LayerOptions, SerializedStrokeLayer } from "./Layer";
import type { Selection } from "../selection/SelectionManager";

export type StrokePoint = {
  x: number;
  y: number;
};

export type StrokeStyle = "pencil" | "pen" | "brush" | "marker" | "highlighter";

export type StrokeSelectionClip = Selection & {
  coordinateSpace?: "layer" | "world";
};

export type StrokePath = {
  color: [number, number, number, number];
  points: StrokePoint[];
  selectionClip?: StrokeSelectionClip | null;
  strokeStyle: StrokeStyle;
  strokeWidth: number;
};

export type StrokeLayerOptions = Omit<LayerOptions, "type"> & {
  color?: [number, number, number, number];
  paths?: Array<StrokePath | StrokePoint[]>;
  points?: StrokePoint[];
  strokeStyle?: StrokeStyle;
  strokeWidth?: number;
};

export class StrokeLayer extends Layer {
  color: [number, number, number, number];
  paths: StrokePath[];
  revision = 0;
  strokeStyle: StrokeStyle;
  strokeWidth: number;

  constructor(options: StrokeLayerOptions) {
    super({
      ...options,
      type: "stroke"
    });

    this.color = options.color ?? [0.07, 0.08, 0.09, 1];
    this.strokeStyle = options.strokeStyle ?? "pen";
    this.strokeWidth = Math.max(1, options.strokeWidth ?? 6);
    this.paths = normalizeStrokePaths(options.paths, options.points, {
      color: this.color,
      strokeStyle: this.strokeStyle,
      strokeWidth: this.strokeWidth
    });
  }

  appendWorldPath(
    worldPoints: StrokePoint[],
    style: {
      color?: [number, number, number, number];
      selectionClip?: StrokeSelectionClip | null;
      strokeStyle?: StrokeStyle;
      strokeWidth?: number;
    } = {}
  ) {
    const previousWorldPaths = this.getWorldPaths();
    const nextStyle = {
      color: style.color ?? this.color,
      strokeStyle: style.strokeStyle ?? this.strokeStyle,
      strokeWidth: Math.max(1, style.strokeWidth ?? this.strokeWidth)
    };
    const nextWorldPaths = [
      ...previousWorldPaths,
      {
        color: nextStyle.color,
        points: worldPoints,
        selectionClip: style.selectionClip === undefined ? null : cloneSelectionClip(style.selectionClip),
        strokeStyle: nextStyle.strokeStyle,
        strokeWidth: nextStyle.strokeWidth
      }
    ];

    this.color = nextStyle.color;
    this.strokeStyle = nextStyle.strokeStyle;
    this.strokeWidth = nextStyle.strokeWidth;
    this.setWorldPaths(nextWorldPaths);
  }

  eraseWorldCircle(center: StrokePoint, radius: number) {
    const nextWorldPaths: StrokePath[] = [];

    for (const path of this.getWorldPaths()) {
      for (const points of erasePathWithCircle(path.points, center, radius)) {
        nextWorldPaths.push({
          ...path,
          points
        });
      }
    }

    this.setWorldPaths(nextWorldPaths);

    return this.paths.length > 0;
  }

  setWorldPathAt(index: number, worldPoints: StrokePoint[]) {
    const nextWorldPaths = this.getWorldPaths();

    nextWorldPaths[index] = {
      ...nextWorldPaths[index],
      points: worldPoints
    };
    this.setWorldPaths(nextWorldPaths);
  }

  getWorldPaths() {
    const modelMatrix = getModelMatrix(this);

    return this.paths.map((path) => ({
      ...path,
      selectionClip: layerSelectionClipToWorld(path.selectionClip ?? null, modelMatrix),
      points: path.points.map((point) =>
        transformPoint3x3(
          modelMatrix,
          point.x / Math.max(1e-6, this.width),
          point.y / Math.max(1e-6, this.height)
        )
      )
    }));
  }

  private setWorldPaths(worldPaths: StrokePath[]) {
    const allPoints = worldPaths.flatMap((path) => path.points);

    if (allPoints.length === 0) {
      this.paths = [];
      this.width = 1;
      this.height = 1;
      this.rotation = 0;
      this.scaleX = 1;
      this.scaleY = 1;
      this.revision += 1;
      return;
    }

    const maxStrokeWidth = Math.max(...worldPaths.map((path) => path.strokeWidth), this.strokeWidth);
    const padding = Math.max(2, maxStrokeWidth / 2);
    const minX = Math.min(...allPoints.map((point) => point.x)) - padding;
    const minY = Math.min(...allPoints.map((point) => point.y)) - padding;
    const maxX = Math.max(...allPoints.map((point) => point.x)) + padding;
    const maxY = Math.max(...allPoints.map((point) => point.y)) + padding;

    this.x = minX;
    this.y = minY;
    this.width = Math.max(1, maxX - minX);
    this.height = Math.max(1, maxY - minY);
    this.rotation = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.paths = worldPaths.map((path) => ({
      ...path,
      selectionClip: worldSelectionClipToLayer(
        path.selectionClip ?? null,
        minX,
        minY,
        this.width,
        this.height
      ),
      points: path.points.map((point) => ({
        x: point.x - minX,
        y: point.y - minY
      }))
    }));
    this.revision += 1;
  }

  toJSON(): SerializedStrokeLayer {
    return {
      ...this.toJSONBase(),
      color: this.color,
      paths: this.paths,
      strokeStyle: this.strokeStyle,
      strokeWidth: this.strokeWidth,
      type: "stroke"
    };
  }
}

function erasePathWithCircle(points: StrokePoint[], center: StrokePoint, radius: number) {
  if (points.length === 0) {
    return [];
  }

  const radiusSquared = radius * radius;
  const sampleStep = Math.max(1, radius / 3);
  const survivingPaths: StrokePoint[][] = [];
  let currentPath: StrokePoint[] = [];

  function addSample(point: StrokePoint) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const shouldErase = dx * dx + dy * dy <= radiusSquared;

    if (shouldErase) {
      flushCurrentPath();
      return;
    }

    const previous = currentPath.at(-1);

    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.25) {
      currentPath.push(point);
    }
  }

  function flushCurrentPath() {
    if (currentPath.length > 0) {
      survivingPaths.push(currentPath);
      currentPath = [];
    }
  }

  if (points.length === 1) {
    addSample(points[0]);
    flushCurrentPath();
    return survivingPaths;
  }

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const sampleCount = Math.max(1, Math.ceil(distance / sampleStep));

    if (index === 1) {
      addSample(start);
    }

    for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
      const amount = sampleIndex / sampleCount;

      addSample({
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount
      });
    }
  }

  flushCurrentPath();

  return survivingPaths;
}

function normalizeStrokePaths(
  paths: Array<StrokePath | StrokePoint[]> | undefined,
  points: StrokePoint[] | undefined,
  fallback: {
    color: [number, number, number, number];
    strokeStyle: StrokeStyle;
    strokeWidth: number;
  }
) {
  const rawPaths = paths ?? (points ? [points] : []);

  return rawPaths.map((path) => {
    if (Array.isArray(path)) {
      return {
        color: fallback.color,
        points: path,
        strokeStyle: fallback.strokeStyle,
        strokeWidth: fallback.strokeWidth
      };
    }

    return {
      color: path.color ?? fallback.color,
      points: path.points ?? [],
      strokeStyle: path.strokeStyle ?? fallback.strokeStyle,
      strokeWidth: Math.max(1, path.strokeWidth ?? fallback.strokeWidth),
      selectionClip: cloneSelectionClip(path.selectionClip ?? null)
    };
  });
}

function cloneSelectionClip(selection: StrokeSelectionClip | null) {
  return selection
    ? {
        bounds: {
          height: selection.bounds.height,
          width: selection.bounds.width,
          x: selection.bounds.x,
          y: selection.bounds.y
        },
        coordinateSpace: selection.coordinateSpace,
        inverted: selection.inverted,
        shape: selection.shape
      }
    : null;
}

function worldSelectionClipToLayer(
  selection: StrokeSelectionClip | null,
  minX: number,
  minY: number,
  width: number,
  height: number
): StrokeSelectionClip | null {
  if (!selection) {
    return null;
  }

  if (selection.coordinateSpace === "layer") {
    return cloneSelectionClip(selection);
  }

  return {
    bounds: {
      height: selection.bounds.height / Math.max(1e-6, height),
      width: selection.bounds.width / Math.max(1e-6, width),
      x: (selection.bounds.x - minX) / Math.max(1e-6, width),
      y: (selection.bounds.y - minY) / Math.max(1e-6, height)
    },
    coordinateSpace: "layer",
    inverted: selection.inverted,
    shape: selection.shape
  };
}

function layerSelectionClipToWorld(
  selection: StrokeSelectionClip | null,
  modelMatrix: Float32Array
): StrokeSelectionClip | null {
  if (!selection) {
    return null;
  }

  if (selection.coordinateSpace !== "layer") {
    return cloneSelectionClip(selection);
  }

  const bounds = selection.bounds;
  const corners = [
    transformPoint3x3(modelMatrix, bounds.x, bounds.y),
    transformPoint3x3(modelMatrix, bounds.x + bounds.width, bounds.y),
    transformPoint3x3(modelMatrix, bounds.x + bounds.width, bounds.y + bounds.height),
    transformPoint3x3(modelMatrix, bounds.x, bounds.y + bounds.height)
  ];
  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const maxY = Math.max(...corners.map((corner) => corner.y));

  return {
    bounds: {
      height: maxY - minY,
      width: maxX - minX,
      x: minX,
      y: minY
    },
    coordinateSpace: "world",
    inverted: selection.inverted,
    shape: selection.shape
  };
}
