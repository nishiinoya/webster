import { LayerMask } from "../masks/LayerMask";
import type { SerializedLayerMask } from "../masks/LayerMask";

export type LayerType = "shape" | "image" | "text";

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
  fillColor: [number, number, number, number];
  shape: "rectangle" | "ellipse" | "line";
  strokeColor:[number, number, number, number];
  strokeWidth: number;
  type: "shape";
};

export type SerializedImageLayer = SerializedLayerBase & {
  assetId: string;
  assetPath: string;
  mimeType: string;
  type: "image";
};

export type SerializedTextLayer = SerializedLayerBase & {
  align: "left" | "center" | "right";
  bold: boolean;
  color: [number, number, number, number];
  fontFamily: string;
  fontSize: number;
  italic: boolean;
  text: string;
  type: "text";
};

export type SerializedLayer = SerializedShapeLayer | SerializedImageLayer | SerializedTextLayer;

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
      const legacyShapeData = data as SerializedShapeLayer & {
        color?: [number, number, number, number];
      };

      return new ShapeLayer({
        ...getLayerOptions(data),
        fillColor: data.fillColor ?? legacyShapeData.color,
        shape: data.shape ?? "rectangle",
        strokeColor: data.strokeColor ?? [0.07, 0.08, 0.09, 1],
        strokeWidth: data.strokeWidth ?? 0
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

    if (data.type === "text") {
      const { TextLayer } = await import("./TextLayer");
      
      return new TextLayer({
        ...getLayerOptions(data),
        align: data.align,
        bold: data.bold,
        color: data.color,
        fontFamily: data.fontFamily,
        fontSize: data.fontSize,
        italic: data.italic,
        text: data.text
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
