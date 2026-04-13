import { Layer } from "./Layer";
import type { LayerOptions, SerializedImageLayer } from "./Layer";

export type ImageLayerOptions = Omit<LayerOptions, "type"> & {
  assetId?: string;
  image: HTMLImageElement;
  mimeType?: string;
  objectUrl: string;
};

export class ImageLayer extends Layer {
  readonly assetId: string;
  readonly image: HTMLImageElement;
  readonly mimeType: string;
  readonly objectUrl: string;

  constructor(options: ImageLayerOptions) {
    super({
      ...options,
      type: "image"
    });

    this.assetId = options.assetId ?? crypto.randomUUID();
    this.image = options.image;
    this.mimeType = options.mimeType ?? "image/png";
    this.objectUrl = options.objectUrl;
  }

  dispose() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }

  toJSON(): SerializedImageLayer {
    const mimeType = getSerializableMimeType(this.mimeType);
    const assetPath = getAssetPath(this.assetId, mimeType);

    return {
      ...this.toJSONBase(),
      assetId: this.assetId,
      assetPath,
      mimeType,
      type: "image"
    };
  }

  async toAssetBlob() {
    return imageToBlob(this.image, getSerializableMimeType(this.mimeType));
  }
}

async function imageToBlob(image: HTMLImageElement, mimeType: string) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!context || width <= 0 || height <= 0) {
    throw new Error("Unable to serialize image layer.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to serialize image layer."));
        }
      },
      mimeType
    );
  });
}

function getSerializableMimeType(mimeType: string) {
  return mimeType === "image/jpeg" || mimeType === "image/webp" ? mimeType : "image/png";
}

function getAssetPath(assetId: string, mimeType: string) {
  const extension =
    mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";

  return `assets/${assetId}.${extension}`;
}
