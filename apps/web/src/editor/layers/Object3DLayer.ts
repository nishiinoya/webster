/** 3D object layer model with isolated material, lighting, and shadow controls. */
import { Layer, normalizeLayerTexture, serializeImportedLayerTexture } from "./Layer";
import type {
  ImportedLayerTexture,
  LayerOptions,
  LayerTextureSettings,
  Object3DKind,
  SerializedObject3DLayer
} from "./Layer";

export type Object3DLayerOptions = Omit<LayerOptions, "type"> & {
  ambient?: number;
  lightIntensity?: number;
  lightX?: number;
  lightY?: number;
  lightZ?: number;
  materialColor?: [number, number, number, number];
  materialTexture?: Partial<LayerTextureSettings> | null;
  materialTextureImage?: ImportedLayerTexture | null;
  modelName?: string | null;
  modelSource?: string | null;
  objectKind?: Object3DKind;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  shadowOpacity?: number;
  shadowSoftness?: number;
};

export class Object3DLayer extends Layer {
  ambient: number;
  lightIntensity: number;
  lightX: number;
  lightY: number;
  lightZ: number;
  materialColor: [number, number, number, number];
  materialTexture: LayerTextureSettings;
  materialTextureImage: ImportedLayerTexture | null;
  modelName: string | null;
  modelRevision = 0;
  modelSource: string | null;
  objectKind: Object3DKind;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  shadowOpacity: number;
  shadowSoftness: number;

  constructor(options: Object3DLayerOptions) {
    super({
      ...options,
      type: "object3d"
    });

    this.ambient = clamp(options.ambient ?? 0.34, 0, 1);
    this.lightIntensity = clamp(options.lightIntensity ?? 0.9, 0, 2);
    this.lightX = clamp(options.lightX ?? -2.4, -6, 6);
    this.lightY = clamp(options.lightY ?? 3.2, -6, 6);
    this.lightZ = clamp(options.lightZ ?? 4.4, 0.5, 10);
    this.materialColor = normalizeColor(options.materialColor ?? [0.75, 0.88, 0.84, 1]);
    this.materialTexture = normalizeLayerTexture(options.materialTexture);
    this.materialTextureImage = options.materialTextureImage ?? null;
    this.modelName = options.modelName?.trim() || null;
    this.modelSource = options.modelSource?.trim() || null;
    this.objectKind = normalizeObject3DKind(options.objectKind);
    if (this.objectKind === "imported" && !this.modelSource) {
      this.objectKind = "cube";
    }
    this.rotationX = normalizeRotation(options.rotationX ?? -18);
    this.rotationY = normalizeRotation(options.rotationY ?? 34);
    this.rotationZ = normalizeRotation(options.rotationZ ?? 0);
    this.shadowOpacity = clamp(options.shadowOpacity ?? 0.34, 0, 1);
    this.shadowSoftness = clamp(options.shadowSoftness ?? 22, 0, 64);
  }

  toJSON(): SerializedObject3DLayer {
    return {
      ...this.toJSONBase(),
      ambient: this.ambient,
      lightIntensity: this.lightIntensity,
      lightX: this.lightX,
      lightY: this.lightY,
      lightZ: this.lightZ,
      materialColor: this.materialColor,
      materialTexture: this.materialTexture,
      materialTextureImage: serializeImportedLayerTexture(this.materialTextureImage),
      model: this.modelSource
        ? {
            format: "obj",
            name: this.modelName || "Imported model",
            source: this.modelSource
          }
        : null,
      objectKind: this.objectKind,
      rotationX: this.rotationX,
      rotationY: this.rotationY,
      rotationZ: this.rotationZ,
      shadowOpacity: this.shadowOpacity,
      shadowSoftness: this.shadowSoftness,
      type: "object3d"
    };
  }
}

export function normalizeObject3DKind(kind: Object3DKind | undefined): Object3DKind {
  if (kind === "sphere" || kind === "pyramid" || kind === "imported") {
    return kind;
  }

  return "cube";
}

export function normalizeRotation(rotation: number) {
  return clamp(Number.isFinite(rotation) ? rotation : 0, -360, 360);
}

function normalizeColor(color: [number, number, number, number]): [number, number, number, number] {
  return [
    clamp(color[0], 0, 1),
    clamp(color[1], 0, 1),
    clamp(color[2], 0, 1),
    clamp(color[3], 0, 1)
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}
