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
  indices?: Uint16Array | Uint32Array;
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
  id: string;
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
  "colors" | "indices" | "normals" | "tangents" | "texCoords" | "vertices"
> & {
  colors?: number[];
  indices?: number[];
  normals: number[];
  tangents?: number[];
  texCoords: number[];
  vertices: number[];
};

export type SerializedImported3DTexture = Omit<Imported3DTexture, "image">;

export type SerializedInlineImported3DModel = Omit<
  Imported3DModel,
  "parts" | "textures"
> & {
  parts: SerializedImported3DPart[];
  textures: SerializedImported3DTexture[];
  version: 2;
};

export type SerializedImported3DPartAsset = Omit<
  Imported3DPart,
  "colors" | "indices" | "normals" | "tangents" | "texCoords" | "vertices"
> & {
  colorsAssetPath?: string;
  indicesAssetPath?: string;
  indicesComponentType?: "uint16" | "uint32";
  normalsAssetPath: string;
  tangentsAssetPath?: string;
  texCoordsAssetPath: string;
  verticesAssetPath: string;
};

export type SerializedImported3DTextureAsset = Omit<Imported3DTexture, "dataUrl" | "image"> & {
  assetPath: string;
};

export type SerializedAssetImported3DModel = Omit<
  Imported3DModel,
  "parts" | "textures"
> & {
  parts: SerializedImported3DPartAsset[];
  textures: SerializedImported3DTextureAsset[];
  version: 3;
};

export type SerializedImported3DModelReference = {
  assetPath: string;
  id: string;
  name: string;
  sourceFormat: Imported3DSourceFormat;
  stats: Imported3DModelStats;
  version: 3;
};

export type SerializedImported3DModel =
  | SerializedInlineImported3DModel
  | SerializedAssetImported3DModel
  | SerializedImported3DModelReference;

export type Imported3DModelAssetEntry = {
  blob: Blob;
  path: string;
};

export function serializeImported3DModel(
  model: Imported3DModel | null
): SerializedInlineImported3DModel | null {
  if (!model) {
    return null;
  }

  return {
    id: model.id,
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
      indices: part.indices ? Array.from(part.indices) : undefined,
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

export async function serializeImported3DModelToAssets(
  model: Imported3DModel,
  basePath: string
): Promise<{
  assets: Imported3DModelAssetEntry[];
  model: SerializedAssetImported3DModel;
}> {
  const assets: Imported3DModelAssetEntry[] = [];
  const parts = model.parts.map((part, index): SerializedImported3DPartAsset => {
    const partPath = `${basePath}/parts/${index}-${sanitizeAssetPathSegment(part.name || "part")}`;
    const serializedPart: SerializedImported3DPartAsset = {
      materialName: part.materialName,
      name: part.name,
      normalsAssetPath: `${partPath}-normals.f32`,
      texCoordsAssetPath: `${partPath}-texcoords.f32`,
      verticesAssetPath: `${partPath}-vertices.f32`
    };

    assets.push(
      { blob: typedArrayToBlob(part.vertices), path: serializedPart.verticesAssetPath },
      { blob: typedArrayToBlob(part.normals), path: serializedPart.normalsAssetPath },
      { blob: typedArrayToBlob(part.texCoords), path: serializedPart.texCoordsAssetPath }
    );

    if (part.colors) {
      serializedPart.colorsAssetPath = `${partPath}-colors.f32`;
      assets.push({ blob: typedArrayToBlob(part.colors), path: serializedPart.colorsAssetPath });
    }

    if (part.tangents) {
      serializedPart.tangentsAssetPath = `${partPath}-tangents.f32`;
      assets.push({
        blob: typedArrayToBlob(part.tangents),
        path: serializedPart.tangentsAssetPath
      });
    }

    if (part.indices) {
      serializedPart.indicesAssetPath = `${partPath}-indices.${part.indices instanceof Uint32Array ? "u32" : "u16"}`;
      serializedPart.indicesComponentType =
        part.indices instanceof Uint32Array ? "uint32" : "uint16";
      assets.push({
        blob: typedArrayToBlob(part.indices),
        path: serializedPart.indicesAssetPath
      });
    }

    return serializedPart;
  });
  const textures = await Promise.all(
    model.textures.map(async (texture, index): Promise<SerializedImported3DTextureAsset> => {
      const extension = getTextureExtension(texture.mimeType);
      const assetPath = `${basePath}/textures/${index}-${sanitizeAssetPathSegment(texture.name || texture.id)}.${extension}`;

      assets.push({
        blob: await importedTextureToBlob(texture),
        path: assetPath
      });

      return {
        assetPath,
        flipY: texture.flipY,
        height: texture.height,
        id: texture.id,
        mimeType: texture.mimeType,
        name: texture.name,
        path: texture.path,
        width: texture.width
      };
    })
  );

  return {
    assets,
    model: {
      id: model.id,
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
      parts,
      sourceFormat: model.sourceFormat,
      stats: { ...model.stats },
      summary: {
        assignedTextureMaps: [...model.summary.assignedTextureMaps],
        guessedTextureMaps: [...model.summary.guessedTextureMaps],
        loadedTextureNames: [...model.summary.loadedTextureNames],
        materialNames: [...model.summary.materialNames],
        unassignedTextureNames: [...model.summary.unassignedTextureNames]
      },
      textures,
      version: 3,
      warnings: [...model.warnings]
    }
  };
}

export async function deserializeImported3DModel(
  model: SerializedImported3DModel | null | undefined,
  assets = new Map<string, Blob>()
): Promise<Imported3DModel | null> {
  if (!model) {
    return null;
  }

  if (model.version === 3) {
    if (isImported3DModelReference(model)) {
      const cachedModel = getCachedImported3DModel(assets, model.assetPath);

      if (cachedModel) {
        return cachedModel;
      }

      const loadedModel = loadReferencedImported3DModel(model.assetPath, assets);

      cacheImported3DModel(assets, model.assetPath, loadedModel);

      return loadedModel;
    }

    return {
      id: model.id ?? crypto.randomUUID(),
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
      parts: await Promise.all(
        model.parts.map(async (part) => ({
          colors: part.colorsAssetPath
            ? await readFloat32ModelAsset(assets, part.colorsAssetPath)
            : undefined,
          indices: part.indicesAssetPath
            ? await readIndexModelAsset(
                assets,
                part.indicesAssetPath,
                part.indicesComponentType ?? "uint16"
              )
            : undefined,
          materialName: part.materialName,
          name: part.name,
          normals: await readFloat32ModelAsset(assets, part.normalsAssetPath),
          tangents: part.tangentsAssetPath
            ? await readFloat32ModelAsset(assets, part.tangentsAssetPath)
            : undefined,
          texCoords: await readFloat32ModelAsset(assets, part.texCoordsAssetPath),
          vertices: await readFloat32ModelAsset(assets, part.verticesAssetPath)
        }))
      ),
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
        model.textures.map(async (texture) => {
          const asset = assets.get(texture.assetPath);

          if (!asset) {
            throw new Error(`Missing 3D texture asset: ${texture.assetPath}`);
          }

          const objectUrl = URL.createObjectURL(asset);

          return {
            ...texture,
            dataUrl: objectUrl,
            image: await loadImageElement(objectUrl)
          };
        })
      ),
      warnings: [...model.warnings]
    };
  }

  if (model.version !== 2) {
    return null;
  }

  return {
    id: model.id ?? crypto.randomUUID(),
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
      indices: part.indices ? createIndexArray(part.indices) : undefined,
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
    id: model.id,
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
      colors: part.colors,
      indices: part.indices,
      materialName: part.materialName,
      name: part.name,
      normals: part.normals,
      tangents: part.tangents,
      texCoords: part.texCoords,
      vertices: part.vertices
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

  await loadImageElementWithTimeout(image, "Unable to load serialized 3D texture.");

  return image;
}

function loadImageElementWithTimeout(image: HTMLImageElement, errorMessage: string) {
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const timeoutId = window.setTimeout(() => {
      finish(new Error(`${errorMessage} The image load timed out.`));
    }, 15000);

    function finish(error?: Error) {
      if (finished) {
        return;
      }

      finished = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }

    image.onload = () => finish();
    image.onerror = () => finish(new Error(errorMessage));

    if (image.complete && (image.naturalWidth > 0 || image.width > 0)) {
      finish();
      return;
    }

    image.decode?.().then(() => finish(), () => {
      if (image.complete && (image.naturalWidth > 0 || image.width > 0)) {
        finish();
      }
    });
  });
}

function createIndexArray(values: number[]) {
  const maxIndex = values.reduce((max, value) => Math.max(max, value), 0);

  return maxIndex > 65535 ? new Uint32Array(values) : new Uint16Array(values);
}

function isImported3DModelReference(
  model: SerializedImported3DModel
): model is SerializedImported3DModelReference {
  return model.version === 3 && "assetPath" in model && !("parts" in model);
}

async function loadReferencedImported3DModel(assetPath: string, assets: Map<string, Blob>) {
  const asset = assets.get(assetPath);

  if (!asset) {
    throw new Error(`Missing 3D model asset: ${assetPath}`);
  }

  try {
    const assetModel = JSON.parse(await asset.text()) as SerializedAssetImported3DModel;

    return deserializeImported3DModel(assetModel, assets);
  } catch (error) {
    getImported3DModelCache(assets).delete(assetPath);
    throw error;
  }
}

function getCachedImported3DModel(assets: Map<string, Blob>, assetPath: string) {
  return getImported3DModelCache(assets).get(assetPath) ?? null;
}

function cacheImported3DModel(
  assets: Map<string, Blob>,
  assetPath: string,
  model: Promise<Imported3DModel | null>
) {
  getImported3DModelCache(assets).set(assetPath, model);
}

function getImported3DModelCache(assets: Map<string, Blob>) {
  let cache = imported3DModelAssetCaches.get(assets);

  if (!cache) {
    cache = new Map<string, Promise<Imported3DModel | null>>();
    imported3DModelAssetCaches.set(assets, cache);
  }

  return cache;
}

const imported3DModelAssetCaches = new WeakMap<
  Map<string, Blob>,
  Map<string, Promise<Imported3DModel | null>>
>();

function typedArrayToBlob(view: ArrayBufferView) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

  return new Blob([new Uint8Array(bytes)], {
    type: "application/octet-stream"
  });
}

async function readFloat32ModelAsset(assets: Map<string, Blob>, path: string) {
  const asset = assets.get(path);

  if (!asset) {
    throw new Error(`Missing 3D geometry asset: ${path}`);
  }

  return new Float32Array(await asset.arrayBuffer());
}

async function readIndexModelAsset(
  assets: Map<string, Blob>,
  path: string,
  componentType: "uint16" | "uint32"
) {
  const asset = assets.get(path);

  if (!asset) {
    throw new Error(`Missing 3D index asset: ${path}`);
  }

  const buffer = await asset.arrayBuffer();

  return componentType === "uint32" ? new Uint32Array(buffer) : new Uint16Array(buffer);
}

async function importedTextureToBlob(texture: Imported3DTexture) {
  try {
    const response = await fetch(texture.dataUrl);

    if (response.ok) {
      return response.blob();
    }
  } catch {
    // Fall through to a transparent placeholder; geometry still remains recoverable.
  }

  return new Blob([], { type: texture.mimeType || "application/octet-stream" });
}

function getTextureExtension(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  if (mimeType.includes("gif")) {
    return "gif";
  }

  return "png";
}

function sanitizeAssetPathSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-z0-9._-]+/giu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 80) || "asset"
  );
}
