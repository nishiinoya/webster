/** Shape layer model. */
import { Layer, normalizeLayerTexture, serializeImportedLayerTexture } from "./Layer";
import type {
  ImportedLayerTexture,
  LayerOptions,
  LayerTextureSettings,
  SerializedShapeLayer
} from "./Layer";

export type ShapePathPoint = { x: number; y: number };

export type ShapeKind =
  | "rectangle"
  | "circle"
  | "line"
  | "triangle"
  | "diamond"
  | "arrow"
  | "custom";

export type ShapeLayerOptions = Omit<LayerOptions, "type"> & {
  customPath?: ShapePathPoint[] | null;
  fillColor?: [number, number, number, number];
  shape?: ShapeKind;
  strokeColor?: [number, number, number, number];
  strokeWidth?: number;
  texture?: Partial<LayerTextureSettings> | null;
  textureImage?: ImportedLayerTexture | null;
};

export class ShapeLayer extends Layer {
  customPath: ShapePathPoint[];
  fillColor: [number, number, number, number];
  shape: ShapeKind;
  strokeColor: [number, number, number, number];
  strokeWidth: number;
  texture: LayerTextureSettings;
  textureImage: ImportedLayerTexture | null;

  constructor(options: ShapeLayerOptions) {
    super({
      ...options,
      type: "shape"
    });

    this.customPath = normalizeCustomPath(options.customPath);
    this.fillColor = options.fillColor ?? [0.18, 0.49, 0.44, 1];
    this.shape = options.shape ?? "rectangle";
    this.strokeColor = options.strokeColor ?? [0.07, 0.08, 0.09, 1];
    this.strokeWidth = options.strokeWidth ?? 0;
    this.texture = normalizeLayerTexture(options.texture);
    this.textureImage = options.textureImage ?? null;
  }


  toJSON(): SerializedShapeLayer {
    return {
      ...this.toJSONBase(),
      customPath: this.shape === "custom" ? this.customPath.map((point) => ({ ...point })) : null,
      fillColor: this.fillColor,
      shape: this.shape,
      strokeColor: this.strokeColor,
      strokeWidth: this.strokeWidth,
      texture: this.texture,
      textureImage: serializeImportedLayerTexture(this.textureImage),
      type: "shape"
    };
  }
}

function normalizeCustomPath(points?: ShapePathPoint[] | null) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points
    .map((point) => ({
      x: Number.isFinite(point.x) ? point.x : 0,
      y: Number.isFinite(point.y) ? point.y : 0
    }))
    .filter((point) => point.x >= -1e6 && point.x <= 1e6 && point.y >= -1e6 && point.y <= 1e6);
}
