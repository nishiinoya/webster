/** Image layer model and serialization helpers. */
import { Layer } from "./Layer";
import type { ImageLayerGeometry, LayerOptions, SerializedImageLayer } from "./Layer";

export type ImageLayerOptions = Omit<LayerOptions, "type"> & {
  assetId?: string;
  geometry?: Partial<ImageLayerGeometry> | null;
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
  geometry: ImageLayerGeometry;
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
    this.geometry = normalizeImageLayerGeometry(options.geometry);
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
      geometry: isDefaultImageLayerGeometry(this.geometry) ? undefined : cloneImageLayerGeometry(this.geometry),
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

export function createDefaultImageLayerGeometry(): ImageLayerGeometry {
  return {
    corners: {
      bottomLeft: { x: 0, y: 0 },
      bottomRight: { x: 1, y: 0 },
      topLeft: { x: 0, y: 1 },
      topRight: { x: 1, y: 1 }
    },
    crop: {
      bottom: 0,
      left: 0,
      right: 1,
      top: 1
    }
  };
}

export function cloneImageLayerGeometry(geometry: ImageLayerGeometry): ImageLayerGeometry {
  return {
    corners: {
      bottomLeft: { ...geometry.corners.bottomLeft },
      bottomRight: { ...geometry.corners.bottomRight },
      topLeft: { ...geometry.corners.topLeft },
      topRight: { ...geometry.corners.topRight }
    },
    crop: { ...geometry.crop }
  };
}

export function normalizeImageLayerGeometry(
  geometry?: Partial<ImageLayerGeometry> | null
): ImageLayerGeometry {
  const fallback = createDefaultImageLayerGeometry();

  return {
    corners: {
      bottomLeft: normalizePoint(geometry?.corners?.bottomLeft, fallback.corners.bottomLeft),
      bottomRight: normalizePoint(geometry?.corners?.bottomRight, fallback.corners.bottomRight),
      topLeft: normalizePoint(geometry?.corners?.topLeft, fallback.corners.topLeft),
      topRight: normalizePoint(geometry?.corners?.topRight, fallback.corners.topRight)
    },
    crop: normalizeCrop(geometry?.crop, fallback.crop)
  };
}

export function isDefaultImageLayerGeometry(geometry: ImageLayerGeometry) {
  const fallback = createDefaultImageLayerGeometry();

  return (
    arePointsEqual(geometry.corners.bottomLeft, fallback.corners.bottomLeft) &&
    arePointsEqual(geometry.corners.bottomRight, fallback.corners.bottomRight) &&
    arePointsEqual(geometry.corners.topLeft, fallback.corners.topLeft) &&
    arePointsEqual(geometry.corners.topRight, fallback.corners.topRight) &&
    geometry.crop.left === fallback.crop.left &&
    geometry.crop.right === fallback.crop.right &&
    geometry.crop.bottom === fallback.crop.bottom &&
    geometry.crop.top === fallback.crop.top
  );
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

function normalizePoint(
  point: { x?: number; y?: number } | undefined,
  fallback: { x: number; y: number }
) {
  return {
    x: Number.isFinite(point?.x) ? Number(point?.x) : fallback.x,
    y: Number.isFinite(point?.y) ? Number(point?.y) : fallback.y
  };
}

function normalizeCrop(
  crop: Partial<ImageLayerGeometry["crop"]> | undefined,
  fallback: ImageLayerGeometry["crop"]
) {
  let left = clamp01(Number.isFinite(crop?.left) ? Number(crop?.left) : fallback.left);
  let right = clamp01(Number.isFinite(crop?.right) ? Number(crop?.right) : fallback.right);
  let bottom = clamp01(Number.isFinite(crop?.bottom) ? Number(crop?.bottom) : fallback.bottom);
  let top = clamp01(Number.isFinite(crop?.top) ? Number(crop?.top) : fallback.top);
  const minSpan = 0.01;

  if (right - left < minSpan) {
    const center = clamp01((left + right) / 2);

    left = Math.max(0, center - minSpan / 2);
    right = Math.min(1, left + minSpan);
    left = Math.max(0, right - minSpan);
  }

  if (top - bottom < minSpan) {
    const center = clamp01((bottom + top) / 2);

    bottom = Math.max(0, center - minSpan / 2);
    top = Math.min(1, bottom + minSpan);
    bottom = Math.max(0, top - minSpan);
  }

  return {
    bottom,
    left,
    right,
    top
  };
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function arePointsEqual(left: { x: number; y: number }, right: { x: number; y: number }) {
  return left.x === right.x && left.y === right.y;
}

function getSerializableMimeType(mimeType: string) {
  return mimeType === "image/jpeg" || mimeType === "image/webp" ? mimeType : "image/png";
}

function getAssetPath(assetId: string, mimeType: string) {
  const extension =
    mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";

  return `assets/${assetId}.${extension}`;
}
