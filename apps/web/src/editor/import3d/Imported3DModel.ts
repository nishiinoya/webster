export type Imported3DSourceFormat =
  | "obj"
  | "gltf"
  | "glb"
  | "stl"
  | "ply"
  | "fbx"
  | "dae"
  | "3ds"
  | "unknown";

export type Imported3DAlphaMode = "OPAQUE" | "MASK" | "BLEND";

export type Imported3DTextureChannel = "r" | "g" | "b" | "a";

export type Imported3DPart = {
  colors?: Float32Array;
  materialName: string | null;
  name: string;
  normals: Float32Array;
  tangents?: Float32Array;
  texCoords: Float32Array;
  vertices: Float32Array;
};

export type Imported3DMaterial = {
  alphaMode?: Imported3DAlphaMode;
  baseColor: [number, number, number, number];
  baseColorTextureName: string | null;
  bumpTextureName: string | null;
  diffuseTextureName: string | null;
  emissiveColor: [number, number, number] | null;
  emissiveTextureName: string | null;
  glossinessTextureName: string | null;
  guessedTextureNames?: string[];
  heightTextureName: string | null;
  metallic: number | null;
  metallicTextureChannel?: Imported3DTextureChannel;
  metallicTextureName: string | null;
  name: string;
  normalTextureName: string | null;
  occlusionTextureName: string | null;
  opacity: number;
  roughness: number | null;
  roughnessTextureChannel?: Imported3DTextureChannel;
  roughnessTextureName: string | null;
  shininess: number | null;
  specularColor: [number, number, number] | null;
  specularTextureName: string | null;
};

export type Imported3DTexture = {
  dataUrl: string;
  flipY?: boolean;
  height: number;
  id: string;
  image: HTMLImageElement;
  mimeType: string;
  name: string;
  path?: string;
  width: number;
};

export type Imported3DModelStats = {
  assignedTextureCount: number;
  materialCount: number;
  partCount: number;
  textureCount: number;
  triangleCount: number;
  vertexCount: number;
};

export type Imported3DModelSummary = {
  assignedTextureMaps: string[];
  guessedTextureMaps: string[];
  loadedTextureNames: string[];
  materialNames: string[];
  unassignedTextureNames: string[];
};

export type Imported3DModel = {
  materials: Imported3DMaterial[];
  name: string;
  parts: Imported3DPart[];
  sourceFormat: Imported3DSourceFormat;
  stats: Imported3DModelStats;
  summary: Imported3DModelSummary;
  textures: Imported3DTexture[];
  warnings: string[];
};

export type SerializedImported3DPart = Omit<
  Imported3DPart,
  "colors" | "normals" | "tangents" | "texCoords" | "vertices"
> & {
  colors?: number[];
  normals: number[];
  tangents?: number[];
  texCoords: number[];
  vertices: number[];
};

export type SerializedImported3DTexture = Omit<Imported3DTexture, "image">;

export type SerializedImported3DModel = Omit<
  Imported3DModel,
  "parts" | "textures"
> & {
  parts: SerializedImported3DPart[];
  textures: SerializedImported3DTexture[];
  version: 2;
};

export function serializeImported3DModel(
  model: Imported3DModel | null
): SerializedImported3DModel | null {
  if (!model) {
    return null;
  }

  return {
    materials: model.materials.map((material) => ({
      ...material,
      baseColor: [...material.baseColor],
      emissiveColor: material.emissiveColor ? [...material.emissiveColor] : null,
      guessedTextureNames: material.guessedTextureNames
        ? [...material.guessedTextureNames]
        : undefined,
      specularColor: material.specularColor ? [...material.specularColor] : null
    })),
    name: model.name,
    parts: model.parts.map((part) => ({
      colors: part.colors ? Array.from(part.colors) : undefined,
      materialName: part.materialName,
      name: part.name,
      normals: Array.from(part.normals),
      tangents: part.tangents ? Array.from(part.tangents) : undefined,
      texCoords: Array.from(part.texCoords),
      vertices: Array.from(part.vertices)
    })),
    sourceFormat: model.sourceFormat,
    stats: { ...model.stats },
    summary: {
      assignedTextureMaps: [...model.summary.assignedTextureMaps],
      guessedTextureMaps: [...model.summary.guessedTextureMaps],
      loadedTextureNames: [...model.summary.loadedTextureNames],
      materialNames: [...model.summary.materialNames],
      unassignedTextureNames: [...model.summary.unassignedTextureNames]
    },
    textures: model.textures.map((texture) => ({
      dataUrl: texture.dataUrl,
      flipY: texture.flipY,
      height: texture.height,
      id: texture.id,
      mimeType: texture.mimeType,
      name: texture.name,
      path: texture.path,
      width: texture.width
    })),
    version: 2,
    warnings: [...model.warnings]
  };
}

export async function deserializeImported3DModel(
  model: SerializedImported3DModel | null | undefined
): Promise<Imported3DModel | null> {
  if (!model || model.version !== 2) {
    return null;
  }

  return {
    materials: model.materials.map((material) => ({
      ...material,
      baseColor: [...material.baseColor],
      emissiveColor: material.emissiveColor ? [...material.emissiveColor] : null,
      guessedTextureNames: material.guessedTextureNames
        ? [...material.guessedTextureNames]
        : undefined,
      specularColor: material.specularColor ? [...material.specularColor] : null
    })),
    name: model.name,
    parts: model.parts.map((part) => ({
      colors: part.colors ? new Float32Array(part.colors) : undefined,
      materialName: part.materialName,
      name: part.name,
      normals: new Float32Array(part.normals),
      tangents: part.tangents ? new Float32Array(part.tangents) : undefined,
      texCoords: new Float32Array(part.texCoords),
      vertices: new Float32Array(part.vertices)
    })),
    sourceFormat: model.sourceFormat,
    stats: { ...model.stats },
    summary: {
      assignedTextureMaps: [...model.summary.assignedTextureMaps],
      guessedTextureMaps: [...model.summary.guessedTextureMaps],
      loadedTextureNames: [...model.summary.loadedTextureNames],
      materialNames: [...model.summary.materialNames],
      unassignedTextureNames: [...model.summary.unassignedTextureNames]
    },
    textures: await Promise.all(
      model.textures.map(async (texture) => ({
        ...texture,
        image: await loadImageElement(texture.dataUrl)
      }))
    ),
    warnings: [...model.warnings]
  };
}

export function cloneImported3DModel(model: Imported3DModel | null) {
  if (!model) {
    return null;
  }

  return {
    materials: model.materials.map((material) => ({
      ...material,
      baseColor: [...material.baseColor] as [number, number, number, number],
      emissiveColor: material.emissiveColor
        ? ([...material.emissiveColor] as [number, number, number])
        : null,
      guessedTextureNames: material.guessedTextureNames
        ? [...material.guessedTextureNames]
        : undefined,
      specularColor: material.specularColor
        ? ([...material.specularColor] as [number, number, number])
        : null
    })),
    name: model.name,
    parts: model.parts.map((part) => ({
      colors: part.colors ? new Float32Array(part.colors) : undefined,
      materialName: part.materialName,
      name: part.name,
      normals: new Float32Array(part.normals),
      tangents: part.tangents ? new Float32Array(part.tangents) : undefined,
      texCoords: new Float32Array(part.texCoords),
      vertices: new Float32Array(part.vertices)
    })),
    sourceFormat: model.sourceFormat,
    stats: { ...model.stats },
    summary: {
      assignedTextureMaps: [...model.summary.assignedTextureMaps],
      guessedTextureMaps: [...model.summary.guessedTextureMaps],
      loadedTextureNames: [...model.summary.loadedTextureNames],
      materialNames: [...model.summary.materialNames],
      unassignedTextureNames: [...model.summary.unassignedTextureNames]
    },
    textures: model.textures.map((texture) => ({ ...texture })),
    warnings: [...model.warnings]
  } satisfies Imported3DModel;
}

export function summarizeImported3DModel(model: Imported3DModel) {
  return {
    appliedTextureNames: model.summary.assignedTextureMaps,
    assetCount: model.textures.length + model.parts.length,
    guessedTextureMaps: model.summary.guessedTextureMaps,
    materialCount: model.stats.materialCount,
    materialName: model.materials[0]?.name ?? null,
    materialNames: model.summary.materialNames,
    modelName: model.name,
    partCount: model.stats.partCount,
    sourceFormat: model.sourceFormat,
    textureCount: model.stats.textureCount,
    textureName: model.textures[0]?.name ?? null,
    textureNames: model.summary.loadedTextureNames,
    triangleCount: model.stats.triangleCount,
    unassignedTextureNames: model.summary.unassignedTextureNames,
    vertexCount: model.stats.vertexCount,
    warnings: model.warnings
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
      image.onerror = () => reject(new Error("Unable to load serialized 3D texture."));
    });
  }

  return image;
}
