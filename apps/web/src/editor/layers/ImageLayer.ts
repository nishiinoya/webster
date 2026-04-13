import { Layer, LayerOptions } from "./Layer";

export type ImageLayerOptions = Omit<LayerOptions, "type"> & {
  image: HTMLImageElement;
  objectUrl: string;
};

export class ImageLayer extends Layer {
  readonly image: HTMLImageElement;
  readonly objectUrl: string;

  constructor(options: ImageLayerOptions) {
    super({
      ...options,
      type: "image"
    });

    this.image = options.image;
    this.objectUrl = options.objectUrl;
  }

  dispose() {
    URL.revokeObjectURL(this.objectUrl);
  }
}
