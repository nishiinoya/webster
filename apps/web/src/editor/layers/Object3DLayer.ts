/** 3D object layer model with isolated material, lighting, and shadow controls. */
import type { Imported3DModel } from "../import3d/Imported3DModel";
import { cloneImported3DModel, serializeImported3DModel } from "../import3d/Imported3DModel";
import { Layer, normalizeLayerTexture, serializeImportedLayerTexture } from "./Layer";
import type {
  ImportedLayerTexture,
  LayerOptions,
  LayerTextureSettings,
  Object3DKind,
  SerializedObject3DLayer
} from "./Layer";

export type Object3DMaterialSlot = {
  diffuseColor: [number, number, number] | null;
  name: string;
  textureImage: ImportedLayerTexture | null;
  texturePath: string | null;
};

export type Object3DLayerOptions = Omit<LayerOptions, "type"> & {
  ambient?: number;
  lightIntensity?: number;
  lightX?: number;
  lightY?: number;
  lightZ?: number;
  materialColor?: [number, number, number, number];
  materialTexture?: Partial<LayerTextureSettings> | null;
  materialTextureImage?: ImportedLayerTexture | null;
  importedModel?: Imported3DModel | null;
  modelMaterials?: Object3DMaterialSlot[];
  modelName?: string | null;
  modelSource?: string | null;
  objectKind?: Object3DKind;
  objectZoom?: number;
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
  importedModel: Imported3DModel | null;
  modelName: string | null;
  modelRevision = 0;
  modelSource: string | null;
  objectKind: Object3DKind;
  objectZoom: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  shadowOpacity: number;
  shadowSoftness: number;
  modelMaterials: Object3DMaterialSlot[];

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
    this.importedModel = cloneImported3DModel(options.importedModel ?? null);
    this.modelName = options.modelName?.trim() || null;
    this.modelSource = options.modelSource?.trim() || null;
    this.objectKind = normalizeObject3DKind(options.objectKind);
    if (this.importedModel) {
      this.modelName = this.importedModel.name;
      this.objectKind = "imported";
    }
    if (this.objectKind === "imported" && !this.modelSource && !this.importedModel) {
      this.objectKind = "cube";
    }
    this.objectZoom = clamp(options.objectZoom ?? 1, 0.2, 4);
    this.rotationX = normalizeRotation(options.rotationX ?? -18);
    this.rotationY = normalizeRotation(options.rotationY ?? 34);
    this.rotationZ = normalizeRotation(options.rotationZ ?? 0);
    this.shadowOpacity = clamp(options.shadowOpacity ?? 0.34, 0, 1);
    this.shadowSoftness = clamp(options.shadowSoftness ?? 22, 0, 64);
    this.modelMaterials = normalizeObject3DMaterials(options.modelMaterials ?? []);
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
      modelMaterials: this.modelMaterials.map((material) => ({
        diffuseColor: material.diffuseColor,
        name: material.name,
        textureImage: serializeImportedLayerTexture(material.textureImage),
        texturePath: material.texturePath
      })),
      model: this.importedModel
        ? serializeImported3DModel(this.importedModel)
        : this.modelSource
          ? {
              format: "obj",
              name: this.modelName || "Imported model",
              source: this.modelSource
            }
          : null,
      objectKind: this.objectKind,
      objectZoom: this.objectZoom,
      rotationX: this.rotationX,
      rotationY: this.rotationY,
      rotationZ: this.rotationZ,
      shadowOpacity: this.shadowOpacity,
      shadowSoftness: this.shadowSoftness,
      type: "object3d",
    };
  }

  replaceImportedModel(model: Imported3DModel) {
    this.importedModel = cloneImported3DModel(model);
    this.modelName = model.name;
    this.modelSource = null;
    this.objectKind = "imported";
    this.modelRevision += 1;
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

function normalizeObject3DMaterials(materials: Object3DMaterialSlot[]) {
  return materials
    .map((material) => ({
      diffuseColor: material.diffuseColor
        ? [
            clamp(material.diffuseColor[0], 0, 1),
            clamp(material.diffuseColor[1], 0, 1),
            clamp(material.diffuseColor[2], 0, 1)
          ] as [number, number, number]
        : null,
      name: material.name.trim(),
      textureImage: material.textureImage ?? null,
      texturePath: material.texturePath?.trim() || null
    }))
    .filter((material) => material.name);
}
