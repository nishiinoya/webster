/** Base layer model shared by all editable scene layer types. */
import { LayerMask } from "../masks/LayerMask";
import type { SerializedLayerMask } from "../masks/LayerMask";

import type { StrokePath, StrokePoint, StrokeStyle } from "./StrokeLayer";

export type LayerType =
  | "adjustment"
  | "shape"
  | "image"
  | "text"
  | "stroke"
  | "group"
  | "object3d";

export type LayerTextureKind =
  | "none"
  | "checkerboard"
  | "stripes"
  | "dots"
  | "grain"
  | "image";

export type LayerTextureSettings = {
  blend: number;
  color: [number, number, number, number];
  contrast: number;
  kind: LayerTextureKind;
  scale: number;
};

export type ImportedLayerTexture = {
  dataUrl: string;
  height: number;
  id: string;
  image: HTMLImageElement;
  mimeType: string;
  name: string;
  width: number;
};

export type SerializedImportedLayerTexture = Omit<ImportedLayerTexture, "image">;

export type Object3DKind = "cube" | "sphere" | "pyramid" | "imported";

export type SerializedObject3DModel = {
  format: "obj";
  name: string;
  source: string;
};

export type LayerFilterSettings = {
  brightness: number;
  blur: number;
  contrast: number;
  dropShadowBlur: number;
  dropShadowOffsetX: number;
  dropShadowOffsetY: number;
  dropShadowOpacity: number;
  grayscale: number;
  hue: number;
  invert: number;
  saturation: number;
  sepia: number;
  shadow: number;
};

export type LayerFilterAdjustment = {
  bounds: [number, number, number, number];
  filters: LayerFilterSettings;
  inverseMatrix: [number, number, number, number, number, number, number, number, number];
  size: [number, number];
};

export type ImageLayerGeometry = {
  corners: {
    bottomLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
  };
  crop: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  };
};

export const defaultLayerFilters: LayerFilterSettings = {
  brightness: 0,
  blur: 0,
  contrast: 0,
  dropShadowBlur: 0,
  dropShadowOffsetX: 12,
  dropShadowOffsetY: 12,
  dropShadowOpacity: 0,
  grayscale: 0,
  hue: 0,
  invert: 0,
  saturation: 0,
  sepia: 0,
  shadow: 0
};

export const defaultLayerTexture: LayerTextureSettings = {
  blend: 0,
  color: [1, 1, 1, 0.85],
  contrast: 0.7,
  kind: "none",
  scale: 16
};

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
  groupId?: string | null;
  mask?: SerializedLayerMask | null;
  filters?: Partial<LayerFilterSettings>;
};

export type SerializedShapeLayer = SerializedLayerBase & {
  fillColor: [number, number, number, number];
  shape: "rectangle" | "circle" | "ellipse" | "line" | "triangle" | "diamond" | "arrow";
  strokeColor:[number, number, number, number];
  strokeWidth: number;
  texture?: Partial<LayerTextureSettings> | null;
  textureImage?: SerializedImportedLayerTexture | null;
  type: "shape";
};

export type SerializedObject3DLayer = SerializedLayerBase & {
  ambient: number;
  lightIntensity: number;
  lightX: number;
  lightY: number;
  lightZ: number;
  materialColor: [number, number, number, number];
  materialTexture?: Partial<LayerTextureSettings> | null;
  materialTextureImage?: SerializedImportedLayerTexture | null;
  model?: SerializedObject3DModel | null;
  objectKind: Object3DKind;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  shadowOpacity: number;
  shadowSoftness: number;
  type: "object3d";
};

export type SerializedAdjustmentLayer = SerializedLayerBase & {
  type: "adjustment";
};

export type SerializedGroupLayer = SerializedLayerBase & {
  collapsed?: boolean;
  type: "group";
};

export type SerializedImageLayer = SerializedLayerBase & {
  assetId: string;
  assetPath: string;
  geometry?: Partial<ImageLayerGeometry> | null;
  mimeType: string;
  originalAssetId?: string;
  originalAssetPath?: string;
  originalMimeType?: string;
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

export type SerializedStrokeLayer = SerializedLayerBase & {
  color: [number, number, number, number];
  paths?: Array<StrokePath | StrokePoint[]>;
  points?: StrokePoint[];
  strokeStyle: StrokeStyle;
  strokeWidth: number;
  type: "stroke";
};

export type SerializedLayer =
  | SerializedAdjustmentLayer
  | SerializedGroupLayer
  | SerializedObject3DLayer
  | SerializedShapeLayer
  | SerializedImageLayer
  | SerializedTextLayer
  | SerializedStrokeLayer;

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
  groupId?: string | null;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  mask?: LayerMask | null;
  filters?: Partial<LayerFilterSettings>;
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
  groupId: string | null;
  mask: LayerMask | null;
  filters: LayerFilterSettings;

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
    this.groupId = options.groupId ?? null;
    this.mask = options.mask ?? null;
    this.filters = normalizeLayerFilters(options.filters);
  }

  static async fromJSON(data: SerializedLayer, assets = new Map<string, Blob>()) {
    if (data.type === "adjustment") {
      const { AdjustmentLayer } = await import("./AdjustmentLayer");

      return new AdjustmentLayer(getLayerOptions(data));
    }

    if (data.type === "shape") {
      const { ShapeLayer } = await import("./ShapeLayer");
      const legacyShapeData = data as SerializedShapeLayer & {
        color?: [number, number, number, number];
      };

      return new ShapeLayer({
        ...getLayerOptions(data),
        fillColor: data.fillColor ?? legacyShapeData.color,
        shape: data.shape === "ellipse" ? "circle" : data.shape ?? "rectangle",
        strokeColor: data.strokeColor ?? [0.07, 0.08, 0.09, 1],
        strokeWidth: data.strokeWidth ?? 0,
        texture: data.texture,
        textureImage: data.textureImage
          ? await loadImportedLayerTexture(data.textureImage)
          : null
      });
    }

    if (data.type === "object3d") {
      const { Object3DLayer } = await import("./Object3DLayer");

      return new Object3DLayer({
        ...getLayerOptions(data),
        ambient: data.ambient,
        lightIntensity: data.lightIntensity,
        lightX: data.lightX,
        lightY: data.lightY,
        lightZ: data.lightZ,
        materialColor: data.materialColor,
        materialTexture: data.materialTexture,
        materialTextureImage: data.materialTextureImage
          ? await loadImportedLayerTexture(data.materialTextureImage)
          : null,
        modelName: data.model?.name,
        modelSource: data.model?.source,
        objectKind: data.objectKind,
        rotationX: data.rotationX,
        rotationY: data.rotationY,
        rotationZ: data.rotationZ,
        shadowOpacity: data.shadowOpacity,
        shadowSoftness: data.shadowSoftness
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
      const originalAssetPath = data.originalAssetPath ?? data.assetPath;
      const originalAssetId = data.originalAssetId ?? data.assetId;
      const originalAsset =
        assets.get(originalAssetPath) ?? assets.get(originalAssetId) ?? asset;
      const sharesOriginalAsset =
        originalAssetPath === data.assetPath || originalAssetId === data.assetId;
      const originalObjectUrl = sharesOriginalAsset
        ? objectUrl
        : URL.createObjectURL(originalAsset);
      const originalImage = sharesOriginalAsset ? image : await loadImageElement(originalObjectUrl);

      return new ImageLayer({
        ...getLayerOptions(data),
        assetId: data.assetId,
        geometry: data.geometry,
        originalAssetId,
        originalImage,
        originalMimeType: data.originalMimeType ?? data.mimeType,
        originalObjectUrl,
        mimeType: data.mimeType,
        image,
        objectUrl
      });
    }

    if (data.type === "group") {
      const { GroupLayer } = await import("./GroupLayer");

      return new GroupLayer({
        ...getLayerOptions(data),
        collapsed: data.collapsed ?? false
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

    if (data.type === "stroke") {
      const { StrokeLayer } = await import("./StrokeLayer");

      return new StrokeLayer({
        ...getLayerOptions(data),
        color: data.color,
        paths: data.paths,
        points: data.points,
        strokeStyle: data.strokeStyle,
        strokeWidth: data.strokeWidth
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
      groupId: this.groupId,
      filters: this.filters,
      mask: this.mask?.toJSON() ?? null
    };
  }
}

export function normalizeLayerFilters(
  filters?: Partial<LayerFilterSettings> | null
): LayerFilterSettings {
  return {
    brightness: clampFilter(filters?.brightness ?? defaultLayerFilters.brightness, -1, 1),
    blur: clampFilter(filters?.blur ?? defaultLayerFilters.blur, 0, 64),
    contrast: clampFilter(filters?.contrast ?? defaultLayerFilters.contrast, -1, 1),
    dropShadowBlur: clampFilter(
      filters?.dropShadowBlur ?? defaultLayerFilters.dropShadowBlur,
      0,
      80
    ),
    dropShadowOffsetX: clampFilter(
      filters?.dropShadowOffsetX ?? defaultLayerFilters.dropShadowOffsetX,
      -240,
      240
    ),
    dropShadowOffsetY: clampFilter(
      filters?.dropShadowOffsetY ?? defaultLayerFilters.dropShadowOffsetY,
      -240,
      240
    ),
    dropShadowOpacity: clampFilter(
      filters?.dropShadowOpacity ?? defaultLayerFilters.dropShadowOpacity,
      0,
      1
    ),
    grayscale: clampFilter(filters?.grayscale ?? defaultLayerFilters.grayscale, 0, 1),
    hue: clampFilter(filters?.hue ?? defaultLayerFilters.hue, -180, 180),
    invert: clampFilter(filters?.invert ?? defaultLayerFilters.invert, 0, 1),
    saturation: clampFilter(filters?.saturation ?? defaultLayerFilters.saturation, -1, 1),
    sepia: clampFilter(filters?.sepia ?? defaultLayerFilters.sepia, 0, 1),
    shadow: clampFilter(filters?.shadow ?? defaultLayerFilters.shadow, -1, 1)
  };
}

export function normalizeLayerTexture(
  texture?: Partial<LayerTextureSettings> | null
): LayerTextureSettings {
  const kind = normalizeTextureKind(texture?.kind);

  return {
    blend: kind === "none" ? 0 : clampFilter(texture?.blend ?? defaultLayerTexture.blend, 0, 1),
    color: normalizeColor(texture?.color, defaultLayerTexture.color),
    contrast: clampFilter(texture?.contrast ?? defaultLayerTexture.contrast, 0, 1),
    kind,
    scale: clampFilter(texture?.scale ?? defaultLayerTexture.scale, 2, 96)
  };
}

function clampFilter(value: number, min: number, max: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, min), max);
}

function normalizeTextureKind(kind: LayerTextureKind | undefined): LayerTextureKind {
  if (
    kind === "checkerboard" ||
    kind === "stripes" ||
    kind === "dots" ||
    kind === "grain" ||
    kind === "image"
  ) {
    return kind;
  }

  return "none";
}

function normalizeColor(
  color: [number, number, number, number] | undefined,
  fallback: [number, number, number, number]
): [number, number, number, number] {
  return [
    clampFilter(color?.[0] ?? fallback[0], 0, 1),
    clampFilter(color?.[1] ?? fallback[1], 0, 1),
    clampFilter(color?.[2] ?? fallback[2], 0, 1),
    clampFilter(color?.[3] ?? fallback[3], 0, 1)
  ];
}

export function serializeImportedLayerTexture(
  texture: ImportedLayerTexture | null
): SerializedImportedLayerTexture | null {
  if (!texture) {
    return null;
  }

  return {
    dataUrl: texture.dataUrl,
    height: texture.height,
    id: texture.id,
    mimeType: texture.mimeType,
    name: texture.name,
    width: texture.width
  };
}

export async function loadImportedLayerTexture(
  texture: SerializedImportedLayerTexture
): Promise<ImportedLayerTexture> {
  return {
    dataUrl: texture.dataUrl,
    height: texture.height,
    id: texture.id || crypto.randomUUID(),
    image: await loadImageElement(texture.dataUrl),
    mimeType: texture.mimeType || "image/png",
    name: texture.name || "Texture",
    width: texture.width
  };
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
    groupId: data.groupId ?? null,
    filters: data.filters,
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
