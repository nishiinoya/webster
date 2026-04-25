/** Shape layer model. */
import { Layer } from "./Layer";
import type { LayerOptions, SerializedShapeLayer } from "./Layer";

export type ShapeKind = "rectangle" | "circle" | "line" | "triangle" | "diamond" | "arrow";

export type ShapeLayerOptions = Omit<LayerOptions, "type"> & {
  fillColor?: [number, number, number, number];
  shape?: ShapeKind;
  strokeColor?: [number, number, number, number];
  strokeWidth?: number;
};

export class ShapeLayer extends Layer {
  fillColor: [number, number, number, number];
  shape: ShapeKind;
  strokeColor: [number, number, number, number];
  strokeWidth: number;

  constructor(options: ShapeLayerOptions) {
    super({
      ...options,
      type: "shape"
    });

    this.fillColor = options.fillColor ?? [0.18, 0.49, 0.44, 1];
    this.shape = options.shape ?? "rectangle";
    this.strokeColor = options.strokeColor ?? [0.07, 0.08, 0.09, 1];
    this.strokeWidth = options.strokeWidth ?? 0;
  }


  toJSON(): SerializedShapeLayer {
    return {
      ...this.toJSONBase(),
      fillColor: this.fillColor,
      shape: this.shape,
      strokeColor: this.strokeColor,
      strokeWidth: this.strokeWidth,
      type: "shape"
    };
  }
}
