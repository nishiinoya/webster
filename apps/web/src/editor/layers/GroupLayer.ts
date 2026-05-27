/** Group layer model used to move and edit related layers together. */
import { Layer } from "./Layer";
import type { LayerOptions, SerializedGroupLayer } from "./Layer";

export type GroupLayerOptions = Omit<LayerOptions, "type"> & {
  collapsed?: boolean;
};

export class GroupLayer extends Layer {
  collapsed: boolean;

  constructor(options: GroupLayerOptions) {
    super({
      ...options,
      type: "group"
    });

    this.collapsed = options.collapsed ?? false;
  }

  toJSON(): SerializedGroupLayer {
    return {
      ...this.toJSONBase(),
      collapsed: this.collapsed,
      type: "group"
    };
  }
}
