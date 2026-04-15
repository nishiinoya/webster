import { LayerMask } from "../masks/LayerMask";
import type { SerializedLayerMask } from "../masks/LayerMask";

export type LayerType = "shape" | "image";

export type SerializedLayerBase = {
  height: number;
  id: string;
  locked: boolean;
  name: string;
  opacity: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  type: LayerType;
  visible: boolean;
  width: number;
  x: number;
  y: number;
  mask?: SerializedLayerMask | null;
};

export type SerializedShapeLayer = SerializedLayerBase & {
  color: [number, number, number, number];
  type: "shape";
};

export type SerializedImageLayer = SerializedLayerBase & {
  assetId: string;
  assetPath: string;
  mimeType: string;
  type: "image";
};

export type SerializedLayer = SerializedShapeLayer | SerializedImageLayer;

export type LayerOptions = {
  id: string;
  type: LayerType;
  name: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  mask?: LayerMask | null;
};

export abstract class Layer {
  readonly id: string;
  readonly type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  mask: LayerMask | null;

  protected constructor(options: LayerOptions) {
    this.id = options.id;
    this.type = options.type;
    this.name = options.name;
    this.visible = options.visible ?? true;
    this.locked = options.locked ?? false;
    this.opacity = options.opacity ?? 1;
    this.x = options.x;
    this.y = options.y;
    this.width = options.width;
    this.height = options.height;
    this.rotation = options.rotation ?? 0;
    this.scaleX = options.scaleX ?? 1;
    this.scaleY = options.scaleY ?? 1;
    this.mask = options.mask ?? null;
  }

  static async fromJSON(data: SerializedLayer, assets = new Map<string, Blob>()) {
    if (data.type === "shape") {
      const { ShapeLayer } = await import("./ShapeLayer");

      return new ShapeLayer({
        ...getLayerOptions(data),
        color: data.color
      });
    }

    if (data.type === "image") {
      const { ImageLayer } = await import("./ImageLayer");
      const asset = assets.get(data.assetPath) ?? assets.get(data.assetId);

      if (!asset) {
        throw new Error(`Missing image asset: ${data.assetPath}`);
      }

      const objectUrl = URL.createObjectURL(asset);
      const image = await loadImageElement(objectUrl);

      return new ImageLayer({
        ...getLayerOptions(data),
        assetId: data.assetId,
        mimeType: data.mimeType,
        image,
        objectUrl
      });
    }

    throw new Error(`Unsupported layer type: ${(data as { type?: string }).type}`);
  }

  abstract toJSON(): Promise<SerializedLayer> | SerializedLayer;

  protected toJSONBase(): SerializedLayerBase {
    return {
      height: this.height,
      id: this.id,
      locked: this.locked,
      name: this.name,
      opacity: this.opacity,
      rotation: this.rotation,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      type: this.type,
      visible: this.visible,
      width: this.width,
      x: this.x,
      y: this.y,
      mask: this.mask?.toJSON() ?? null
    };
  }
}

function getLayerOptions(data: SerializedLayer): LayerOptions {
  return {
    height: data.height,
    id: data.id,
    locked: data.locked,
    name: data.name,
    opacity: data.opacity,
    rotation: data.rotation,
    scaleX: data.scaleX,
    scaleY: data.scaleY,
    type: data.type,
    visible: data.visible,
    width: data.width,
    x: data.x,
    y: data.y,
    mask: data.mask ? LayerMask.fromJSON(data.mask) : null
  };
}

async function loadImageElement(src: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;

  try {
    await image.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to load serialized image layer."));
    });
  }

  return image;
}
