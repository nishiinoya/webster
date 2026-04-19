import { Layer } from "./Layer";
import type { LayerOptions, SerializedImageLayer } from "./Layer";

export type ImageLayerOptions = Omit<LayerOptions, "type"> & {
  assetId?: string;
  image: HTMLImageElement;
  mimeType?: string;
  objectUrl: string;
  originalAssetId?: string;
  originalImage?: HTMLImageElement;
  originalMimeType?: string;
  originalObjectUrl?: string;
};

export class ImageLayer extends Layer {
  assetId: string;
  image: HTMLImageElement;
  mimeType: string;
  objectUrl: string;
  readonly originalAssetId: string;
  readonly originalImage: HTMLImageElement;
  readonly originalMimeType: string;
  readonly originalObjectUrl: string;
  hasWorkingImageChanges = false;
  revision = 0;

  constructor(options: ImageLayerOptions) {
    super({
      ...options,
      type: "image"
    });

    this.assetId = options.assetId ?? crypto.randomUUID();
    this.image = options.image;
    this.mimeType = options.mimeType ?? "image/png";
    this.objectUrl = options.objectUrl;
    this.originalAssetId = options.originalAssetId ?? this.assetId;
    this.originalImage = options.originalImage ?? this.image;
    this.originalMimeType = options.originalMimeType ?? this.mimeType;
    this.originalObjectUrl = options.originalObjectUrl ?? this.objectUrl;
    this.hasWorkingImageChanges =
      this.assetId !== this.originalAssetId || this.objectUrl !== this.originalObjectUrl;
  }

  dispose() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    if (this.originalObjectUrl && this.originalObjectUrl !== this.objectUrl) {
      URL.revokeObjectURL(this.originalObjectUrl);
    }
  }

  replaceImage(
    image: HTMLImageElement,
    objectUrl: string,
    options: { assetId?: string; mimeType?: string } = {}
  ) {
    if (
      this.objectUrl &&
      this.objectUrl !== objectUrl &&
      this.objectUrl !== this.originalObjectUrl
    ) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.assetId = options.assetId ?? crypto.randomUUID();
    this.image = image;
    this.mimeType = options.mimeType ?? this.mimeType;
    this.objectUrl = objectUrl;
    this.hasWorkingImageChanges = true;
    this.revision += 1;
  }

  restoreOriginalImage() {
    if (this.objectUrl && this.objectUrl !== this.originalObjectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.assetId = this.originalAssetId;
    this.image = this.originalImage;
    this.mimeType = this.originalMimeType;
    this.objectUrl = this.originalObjectUrl;
    this.hasWorkingImageChanges = false;
    this.revision += 1;
  }

  toJSON(): SerializedImageLayer {
    const mimeType = getSerializableMimeType(this.mimeType);
    const assetPath = getAssetPath(this.assetId, mimeType);
    const originalMimeType = getSerializableMimeType(this.originalMimeType);
    const originalAssetPath = getAssetPath(this.originalAssetId, originalMimeType);

    return {
      ...this.toJSONBase(),
      assetId: this.assetId,
      assetPath,
      mimeType,
      originalAssetId: this.originalAssetId,
      originalAssetPath,
      originalMimeType,
      type: "image"
    };
  }

  async toAssetBlob() {
    return imageToBlob(this.image, getSerializableMimeType(this.mimeType));
  }

  async toOriginalAssetBlob() {
    return imageToBlob(this.originalImage, getSerializableMimeType(this.originalMimeType));
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
