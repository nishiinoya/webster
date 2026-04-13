import { Layer, LayerOptions } from "./Layer";

export type ShapeLayerOptions = Omit<LayerOptions, "type"> & {
  color: [number, number, number, number];
};

export class ShapeLayer extends Layer {
  color: [number, number, number, number];

  constructor(options: ShapeLayerOptions) {
    super({
      ...options,
      type: "shape"
    });

    this.color = options.color;
  }
}
