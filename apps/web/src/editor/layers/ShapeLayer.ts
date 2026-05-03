/** Shape layer model. */
import { Layer, normalizeLayerTexture, serializeImportedLayerTexture } from "./Layer";
import type {
  ImportedLayerTexture,
  LayerOptions,
  LayerTextureSettings,
  SerializedShapeLayer
} from "./Layer";

export type ShapeKind = "rectangle" | "circle" | "line" | "triangle" | "diamond" | "arrow";

export type ShapeLayerOptions = Omit<LayerOptions, "type"> & {
  fillColor?: [number, number, number, number];
  shape?: ShapeKind;
  strokeColor?: [number, number, number, number];
  strokeWidth?: number;
  texture?: Partial<LayerTextureSettings> | null;
  textureImage?: ImportedLayerTexture | null;
};

export class ShapeLayer extends Layer {
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
