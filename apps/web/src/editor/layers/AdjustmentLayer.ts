/** Adjustment layer model. */
import { Layer } from "./Layer";
import type { LayerOptions, SerializedAdjustmentLayer } from "./Layer";

export type AdjustmentLayerOptions = Omit<LayerOptions, "type">;

export class AdjustmentLayer extends Layer {
  constructor(options: AdjustmentLayerOptions) {
    super({
      ...options,
      type: "adjustment"
    });
  }

  toJSON(): SerializedAdjustmentLayer {
    return {
      ...this.toJSONBase(),
      type: "adjustment"
    };
  }
}
