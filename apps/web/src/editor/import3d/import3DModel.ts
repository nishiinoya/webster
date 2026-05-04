import type {
  Imported3DMaterial,
  Imported3DModel,
  Imported3DPart,
  Imported3DSourceFormat,
  Imported3DTexture,
  Imported3DTextureChannel
} from "./Imported3DModel";

type ModelAssetFile = {
  file: File;
  path: string;
};

type ObjFaceVertex = {
  normalIndex: number | null;
  positionIndex: number;
  texCoordIndex: number | null;
};

type PartBuilder = {
  colors: number[];
  materialName: string | null;
  name: string;
  normals: number[];
  texCoords: number[];
  vertices: number[];
};

type MtlTextureSlot =
  | "diffuseTextureName"
  | "baseColorTextureName"
  | "specularTextureName"
  | "glossinessTextureName"
  | "roughnessTextureName"
  | "metallicTextureName"
  | "normalTextureName"
  | "bumpTextureName"
  | "heightTextureName"
  | "emissiveTextureName"
  | "occlusionTextureName";

type MtlMaterial = {
  baseColor: [number, number, number, number];
  emissiveColor: [number, number, number] | null;
  maps: Partial<Record<MtlTextureSlot, string>>;
  metallic: number | null;
  name: string;
  opacity: number;
  roughness: number | null;
  shininess: number | null;
  specularColor: [number, number, number] | null;
};

type GltfAccessorData = {
  componentCount: number;
  count: number;
  values: number[];
};

type GltfImportContext = {
  basePath: string;
  binaryChunk: Uint8Array | null;
  buffers: Uint8Array[];
  gltf: GltfRoot;
  textureNameByTextureIndex: Map<number, string>;
  textures: Imported3DTexture[];
  warnings: string[];
};

type GltfRoot = {
  accessors?: GltfAccessor[];
  asset?: { version?: string };
  bufferViews?: GltfBufferView[];
  buffers?: GltfBuffer[];
  images?: GltfImage[];
  materials?: GltfMaterial[];
  meshes?: GltfMesh[];
  nodes?: GltfNode[];
  scenes?: GltfScene[];
  scene?: number;
  textures?: GltfTexture[];
};

type GltfAccessor = {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  max?: number[];
  min?: number[];
  normalized?: boolean;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT2" | "MAT3" | "MAT4";
};

type GltfBufferView = {
  buffer: number;
  byteLength: number;
  byteOffset?: number;
  byteStride?: number;
};

type GltfBuffer = {
  byteLength: number;
  uri?: string;
};

type GltfImage = {
  bufferView?: number;
  mimeType?: string;
  name?: string;
  uri?: string;
};

type GltfTexture = {
  name?: string;
  source?: number;
};

type GltfMaterial = {
  alphaMode?: "OPAQUE" | "MASK" | "BLEND";
  emissiveFactor?: [number, number, number];
  emissiveTexture?: GltfTextureInfo;
  extensions?: Record<string, unknown>;
  name?: string;
  normalTexture?: GltfTextureInfo;
  occlusionTexture?: GltfTextureInfo;
  pbrMetallicRoughness?: {
    baseColorFactor?: [number, number, number, number];
    baseColorTexture?: GltfTextureInfo;
    metallicFactor?: number;
    metallicRoughnessTexture?: GltfTextureInfo;
    roughnessFactor?: number;
  };
};

type GltfTextureInfo = {
  index: number;
  texCoord?: number;
};

type GltfSpecularGlossinessExtension = {
  diffuseFactor?: [number, number, number, number];
  diffuseTexture?: GltfTextureInfo;
  glossinessFactor?: number;
  specularFactor?: [number, number, number];
  specularGlossinessTexture?: GltfTextureInfo;
};

type GltfMesh = {
  name?: string;
  primitives?: GltfPrimitive[];
};

type GltfPrimitive = {
  attributes?: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
};

type GltfNode = {
  children?: number[];
  matrix?: number[];
  mesh?: number;
  name?: string;
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  translation?: [number, number, number];
};

type GltfScene = {
  nodes?: number[];
};

const modelExtensions = /\.(obj|glb|gltf|stl|ply|fbx|dae|3ds)$/iu;
const supportedPackageExtensions = /\.(obj|mtl|zip|glb|gltf|bin|stl|ply|fbx|dae|3ds|png|jpe?g|gif|webp|bmp|svg)$/iu;
const imageExtensions = /\.(png|jpe?g|gif|webp|bmp|svg)$/iu;
const defaultMaterialName = "Default material";

export async function import3DModelPackage(files: File[]): Promise<Imported3DModel> {
  const assets = await expandModelAssetFiles(files);
  const modelAsset = choosePrimaryModelAsset(assets);

  if (!modelAsset) {
    throw new Error("No supported 3D model file was found in the selected package.");
  }

  const extension = getFileExtension(modelAsset.path);

  if (extension === "glb") {
    return importGlbModel(modelAsset, assets);
  }

  if (extension === "gltf") {
    return importGltfModel(modelAsset, assets);
  }

  if (extension === "obj") {
    return importObjModel(modelAsset, assets);
  }

  if (extension === "stl") {
    return importStlModel(modelAsset);
  }

  if (extension === "ply") {
    return importPlyModel(modelAsset);
  }

  return finalizeImportedModel({
    materials: [createDefaultMaterial(defaultMaterialName)],
    name: stripExtension(modelAsset.file.name),
    parts: [createFallbackPart()],
    sourceFormat: extensionToSourceFormat(extension),
    textures: [],
    warnings: [
      `${extension.toUpperCase()} files can be selected, but this build imports them as fallback geometry because no browser loader is bundled for that format.`
    ]
  });
}

export function isSupported3DImportFile(file: File) {
  return isZipFile(file) || supportedPackageExtensions.test(file.name) || file.type.startsWith("image/");
}

async function importObjModel(
  objAsset: ModelAssetFile,
  assets: ModelAssetFile[]
): Promise<Imported3DModel> {
  const source = await objAsset.file.text();

  if (!source.trim()) {
    throw new Error("The imported OBJ model is empty.");
  }

  const warnings: string[] = [];
  const objDirectory = getAssetDirectory(objAsset.path);
  const materialHints = parseObjMaterialHints(source);
  const mtlAsset =
    findReferencedAsset(assets, objDirectory, materialHints.mtlNames, isMtlFile) ??
    findFirstAsset(assets, objDirectory, isMtlFile);
  const mtlMaterials = mtlAsset ? parseMtlMaterials(await mtlAsset.file.text(), warnings) : [];
  const mtlDirectory = getAssetDirectory(mtlAsset?.path ?? objAsset.path);
  const textures = await loadAssetTextures(assets.filter((asset) => isImageFile(asset.file)), true);
  const textureByPath = new Map(textures.map((texture) => [texture.path ?? texture.name, texture]));
  const importedMaterials = resolveObjImportedMaterials({
    assets,
    materialHints,
    mtlDirectory,
    mtlMaterials,
    textureByPath,
    warnings
  });
  const parts = parseObjParts(source, importedMaterials, warnings);

  applyConservativeTextureFallbacks(importedMaterials, textures, warnings);

  return finalizeImportedModel({
    materials: importedMaterials,
    name: stripExtension(objAsset.file.name) || "Imported OBJ model",
    parts,
    sourceFormat: "obj",
    textures,
    warnings
  });
}

function parseObjParts(
  source: string,
  materials: Imported3DMaterial[],
  warnings: string[]
): Imported3DPart[] {
  const sourcePositions: number[][] = [];
  const sourceNormals: number[][] = [];
  const sourceTexCoords: number[][] = [];
  const parts: PartBuilder[] = [];
  const knownMaterials = new Set(materials.map((material) => material.name.toLowerCase()));

  let currentObjectName = "OBJ mesh";
  let currentPart: PartBuilder | null = null;
  let currentMaterialName: string | null = null;

  function openPart(materialName: string | null) {
    currentMaterialName = materialName;
    currentPart = {
      colors: [],
      materialName,
      name: materialName ? `${currentObjectName} - ${materialName}` : currentObjectName,
      normals: [],
      texCoords: [],
      vertices: []
    };
    parts.push(currentPart);
  }

  function ensurePart() {
    if (!currentPart) {
      openPart(currentMaterialName);
    }

    return currentPart!;
  }

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.split("#")[0].trim();

    if (!line) {
      continue;
    }

    const [rawKeyword, ...values] = line.split(/\s+/u);
    const keyword = rawKeyword.toLowerCase();

    if ((keyword === "o" || keyword === "g") && values.length > 0) {
      currentObjectName = stripAssetReferenceQuotes(line.slice(rawKeyword.length).trim()) || currentObjectName;
      continue;
    }

    if (keyword === "v" && values.length >= 3) {
      const position = values.slice(0, 3).map(Number);

      if (position.every(Number.isFinite)) {
        sourcePositions.push(position);
      }

      continue;
    }

    if (keyword === "vn" && values.length >= 3) {
      const normal = normalize3(values.slice(0, 3).map(Number));

      if (normal.every(Number.isFinite)) {
        sourceNormals.push(normal);
      }

      continue;
    }

    if (keyword === "vt" && values.length >= 2) {
      const texCoord = values.slice(0, 2).map(Number);

      if (texCoord.every(Number.isFinite)) {
        sourceTexCoords.push([texCoord[0], 1 - texCoord[1]]);
      }

      continue;
    }

    if (keyword === "usemtl") {
      const materialName = stripAssetReferenceQuotes(line.slice(rawKeyword.length).trim()) || null;

      if (materialName && !knownMaterials.has(materialName.toLowerCase())) {
        materials.push(createDefaultMaterial(materialName));
        knownMaterials.add(materialName.toLowerCase());
      }

      openPart(materialName);
      continue;
    }

    if (keyword !== "f" || values.length < 3) {
      continue;
    }

    const face = values
      .map((value) =>
        parseObjFaceVertex(
          value,
          sourcePositions.length,
          sourceTexCoords.length,
          sourceNormals.length
        )
      )
      .filter((vertex): vertex is ObjFaceVertex => Boolean(vertex));

    if (face.length < 3) {
      continue;
    }

    const part = ensurePart();

    for (let index = 1; index < face.length - 1; index += 1) {
      pushObjTriangle(part, [face[0], face[index], face[index + 1]], sourcePositions, sourceTexCoords, sourceNormals);
    }
  }

  const importedParts = parts
    .filter((part) => part.vertices.length >= 9)
    .map((part) => toImportedPart(part));

  if (importedParts.length === 0) {
    warnings.push("The OBJ file contained no readable triangle faces; fallback geometry was used.");
    return [createFallbackPart()];
  }

  return importedParts;
}

function resolveObjImportedMaterials({
  assets,
  materialHints,
  mtlDirectory,
  mtlMaterials,
  textureByPath,
  warnings
}: {
  assets: ModelAssetFile[];
  materialHints: ReturnType<typeof parseObjMaterialHints>;
  mtlDirectory: string;
  mtlMaterials: MtlMaterial[];
  textureByPath: Map<string, Imported3DTexture>;
  warnings: string[];
}) {
  const usedNames = [...new Set(materialHints.usedMaterials)];
  const materials =
    usedNames.length > 0
      ? usedNames.map((name) => {
          const material = mtlMaterials.find(
            (candidate) => candidate.name.toLowerCase() === name.toLowerCase()
          );

          return material ?? createMtlDefaultMaterial(name);
        })
      : mtlMaterials;

  const importedMaterials =
    materials.length > 0
      ? materials.map((material) =>
          convertMtlMaterialToImportedMaterial(material, assets, mtlDirectory, textureByPath, warnings)
        )
      : [createDefaultMaterial(defaultMaterialName)];

  if (!mtlMaterials.length) {
    warnings.push("No MTL material data was found; default material settings were used.");
  }

  return importedMaterials;
}

function convertMtlMaterialToImportedMaterial(
  material: MtlMaterial,
  assets: ModelAssetFile[],
  mtlDirectory: string,
  textureByPath: Map<string, Imported3DTexture>,
  warnings: string[]
): Imported3DMaterial {
  const imported: Imported3DMaterial = {
    alphaMode: material.opacity < 0.999 ? "BLEND" : "OPAQUE",
    baseColor: [...material.baseColor],
    baseColorTextureName: null,
    bumpTextureName: null,
    diffuseTextureName: null,
    emissiveColor: material.emissiveColor ? [...material.emissiveColor] : null,
    emissiveTextureName: null,
    glossinessTextureName: null,
    heightTextureName: null,
    metallic: material.metallic,
    metallicTextureChannel: "r",
    metallicTextureName: null,
    name: material.name,
    normalTextureName: null,
    occlusionTextureName: null,
    opacity: material.opacity,
    roughness: material.roughness ?? (material.shininess ? shininessToRoughness(material.shininess) : null),
    roughnessTextureChannel: "r",
    roughnessTextureName: null,
    shininess: material.shininess,
    specularColor: material.specularColor ? [...material.specularColor] : null,
    specularTextureName: null
  };

  for (const [slot, reference] of Object.entries(material.maps) as Array<[MtlTextureSlot, string]>) {
    const asset = findReferencedAsset(assets, mtlDirectory, [reference], isImageFile);

    if (!asset) {
      warnings.push(`Texture "${reference}" referenced by material "${material.name}" was not found.`);
      continue;
    }

    const texture = textureByPath.get(asset.path);

    if (texture) {
      imported[slot] = texture.name;
    }
  }

  if (!imported.baseColorTextureName && imported.diffuseTextureName) {
    imported.baseColorTextureName = imported.diffuseTextureName;
  }

  return imported;
}

function parseMtlMaterials(source: string, warnings: string[]) {
  const materials: MtlMaterial[] = [];
  let current: MtlMaterial | null = null;

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const [keyword] = line.split(/\s+/u);
    const lowerKeyword = keyword.toLowerCase();
    const value = line.slice(keyword.length).trim();

    if (lowerKeyword === "newmtl") {
      current = createMtlDefaultMaterial(stripAssetReferenceQuotes(value) || `Material ${materials.length + 1}`);
      materials.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (lowerKeyword === "kd") {
      current.baseColor = [...parseColor3(value, current.baseColor.slice(0, 3) as [number, number, number]), current.baseColor[3]];
      continue;
    }

    if (lowerKeyword === "ks") {
      current.specularColor = parseColor3(value, current.specularColor ?? [0.2, 0.2, 0.2]);
      continue;
    }

    if (lowerKeyword === "ke") {
      current.emissiveColor = parseColor3(value, current.emissiveColor ?? [0, 0, 0]);
      continue;
    }

    if (lowerKeyword === "ns") {
      current.shininess = clamp(Number(value), 0, 1000);
      continue;
    }

    if (lowerKeyword === "d") {
      current.opacity = clamp(Number(value), 0, 1);
      current.baseColor[3] = current.opacity;
      continue;
    }

    if (lowerKeyword === "tr") {
      current.opacity = clamp(1 - Number(value), 0, 1);
      current.baseColor[3] = current.opacity;
      continue;
    }

    if (lowerKeyword === "pr") {
      current.roughness = clamp(Number(value), 0, 1);
      continue;
    }

    if (lowerKeyword === "pm") {
      current.metallic = clamp(Number(value), 0, 1);
      continue;
    }

    const slot = getMtlTextureSlot(lowerKeyword);

    if (slot) {
      const texturePath = parseMtlTexturePath(line);

      if (texturePath) {
        current.maps[slot] = texturePath;
      } else {
        warnings.push(`Material "${current.name}" has an empty ${keyword} texture reference.`);
      }
    }
  }

  return materials;
}

function getMtlTextureSlot(keyword: string): MtlTextureSlot | null {
  switch (keyword) {
    case "map_kd":
    case "map_ka":
    case "map_basecolor":
      return "diffuseTextureName";
    case "map_ks":
      return "specularTextureName";
    case "map_ns":
      return "glossinessTextureName";
    case "map_pr":
      return "roughnessTextureName";
    case "map_pm":
      return "metallicTextureName";
    case "norm":
    case "map_kn":
      return "normalTextureName";
    case "bump":
    case "map_bump":
      return "bumpTextureName";
    case "disp":
    case "map_disp":
      return "heightTextureName";
    case "map_ke":
      return "emissiveTextureName";
    case "map_d":
      return "occlusionTextureName";
    default:
      return null;
  }
}

async function importGlbModel(
  asset: ModelAssetFile,
  assets: ModelAssetFile[]
): Promise<Imported3DModel> {
  const bytes = new Uint8Array(await asset.file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("The selected GLB file has an invalid header.");
  }

  let offset = 12;
  let jsonChunk: Uint8Array | null = null;
  let binaryChunk: Uint8Array | null = null;

  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + chunkLength);

    if (chunkType === 0x4e4f534a) {
      jsonChunk = chunk;
    } else if (chunkType === 0x004e4942) {
      binaryChunk = chunk;
    }

    offset += 8 + chunkLength;
  }

  if (!jsonChunk) {
    throw new Error("The GLB file did not contain a JSON scene chunk.");
  }

  const gltf = JSON.parse(new TextDecoder("utf-8").decode(jsonChunk)) as GltfRoot;

  return importGltfRoot({
    assets,
    basePath: getAssetDirectory(asset.path),
    binaryChunk,
    fallbackName: stripExtension(asset.file.name) || "Imported GLB model",
    gltf,
    sourceFormat: "glb"
  });
}

async function importGltfModel(
  asset: ModelAssetFile,
  assets: ModelAssetFile[]
): Promise<Imported3DModel> {
  const gltf = JSON.parse(await asset.file.text()) as GltfRoot;

  return importGltfRoot({
    assets,
    basePath: getAssetDirectory(asset.path),
    binaryChunk: null,
    fallbackName: stripExtension(asset.file.name) || "Imported glTF model",
    gltf,
    sourceFormat: "gltf"
  });
}

async function importGltfRoot({
  assets,
  basePath,
  binaryChunk,
  fallbackName,
  gltf,
  sourceFormat
}: {
  assets: ModelAssetFile[];
  basePath: string;
  binaryChunk: Uint8Array | null;
  fallbackName: string;
  gltf: GltfRoot;
  sourceFormat: "gltf" | "glb";
}) {
  const warnings: string[] = [];
  const buffers = await loadGltfBuffers(gltf, assets, basePath, binaryChunk);
  const gltfTextures = await loadGltfTextures(gltf, buffers, assets, basePath, warnings);
  const textures = gltfTextures.textures;
  const textureNameByTextureIndex = new Map<number, string>();

  gltf.textures?.forEach((texture, index) => {
    const imageIndex = texture.source;
    const imageTexture =
      imageIndex === undefined ? null : gltfTextures.textureByImageIndex.get(imageIndex) ?? null;

    if (imageTexture) {
      textureNameByTextureIndex.set(index, imageTexture.name);
    }
  });

  const context: GltfImportContext = {
    basePath,
    binaryChunk,
    buffers,
    gltf,
    textureNameByTextureIndex,
    textures,
    warnings
  };
  const materials = createGltfMaterials(context);

  applyConservativeTextureFallbacks(materials, textures, warnings);

  const parts = createGltfParts(context, materials);

  if (parts.length === 0) {
    warnings.push("The glTF scene did not contain readable triangle mesh primitives; fallback geometry was used.");
  }

  return finalizeImportedModel({
    materials: materials.length > 0 ? materials : [createDefaultMaterial(defaultMaterialName)],
    name: fallbackName,
    parts: parts.length > 0 ? parts : [createFallbackPart()],
    sourceFormat,
    textures,
    warnings
  });
}

async function loadGltfBuffers(
  gltf: GltfRoot,
  assets: ModelAssetFile[],
  basePath: string,
  binaryChunk: Uint8Array | null
) {
  const buffers: Uint8Array[] = [];

  for (const [index, buffer] of (gltf.buffers ?? []).entries()) {
    if (!buffer.uri && index === 0 && binaryChunk) {
      buffers.push(binaryChunk.subarray(0, buffer.byteLength));
      continue;
    }

    if (buffer.uri?.startsWith("data:")) {
      buffers.push(decodeDataUri(buffer.uri).bytes);
      continue;
    }

    if (!buffer.uri) {
      throw new Error("A glTF buffer is missing its external file reference.");
    }

    const asset = findReferencedAsset(assets, basePath, [buffer.uri], () => true);

    if (!asset) {
      throw new Error(`Missing glTF buffer: ${buffer.uri}`);
    }

    buffers.push(new Uint8Array(await asset.file.arrayBuffer()));
  }

  return buffers;
}

async function loadGltfTextures(
  gltf: GltfRoot,
  buffers: Uint8Array[],
  assets: ModelAssetFile[],
  basePath: string,
  warnings: string[]
) {
  const textures: Imported3DTexture[] = [];
  const textureByImageIndex = new Map<number, Imported3DTexture>();
  const usedNames = new Set<string>();

  for (const [index, image] of (gltf.images ?? []).entries()) {
    try {
      let dataUrl = "";
      let mimeType = image.mimeType || "image/png";
      let name = image.name || `Texture ${index + 1}`;

      if (image.uri?.startsWith("data:")) {
        dataUrl = image.uri;
        mimeType = decodeDataUri(image.uri).mimeType || mimeType;
        name = image.name || `Texture ${index + 1}`;
      } else if (image.uri) {
        const asset = findReferencedAsset(assets, basePath, [image.uri], isImageFile);

        if (!asset) {
          warnings.push(`Missing glTF texture: ${image.uri}`);
          continue;
        }

        dataUrl = await fileToDataUrl(asset.file);
        mimeType = asset.file.type || getMimeTypeFromFilename(asset.file.name);
        name = image.name || getAssetBasename(asset.path);
      } else if (image.bufferView !== undefined) {
        const bytes = getGltfBufferViewBytes(gltf, buffers, image.bufferView);
        const blob = new Blob([copyBytesToArrayBuffer(bytes)], { type: mimeType });

        dataUrl = await blobToDataUrl(blob);
      }

      if (!dataUrl) {
        warnings.push(`glTF image ${index + 1} could not be loaded.`);
        continue;
      }

      const uniqueName = uniqueAssetName(name, usedNames);
      const element = await loadImageElement(dataUrl);

      const texture = {
        dataUrl,
        flipY: false,
        height: element.naturalHeight || element.height,
        id: crypto.randomUUID(),
        image: element,
        mimeType,
        name: uniqueName,
        path: image.uri ? normalizeAssetPath(`${basePath}/${image.uri}`) : uniqueName,
        width: element.naturalWidth || element.width
      };
      textures.push(texture);
      textureByImageIndex.set(index, texture);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `glTF image ${index + 1} could not be loaded.`);
    }
  }

  return { textureByImageIndex, textures };
}

function createGltfMaterials(context: GltfImportContext) {
  return (context.gltf.materials ?? []).map((material, index): Imported3DMaterial => {
    const pbr = material.pbrMetallicRoughness;
    const specGloss = readGltfSpecularGlossinessExtension(material.extensions);
    const usesSpecGloss = Boolean(
      specGloss.diffuseFactor ||
        specGloss.diffuseTexture ||
        specGloss.specularFactor ||
        specGloss.specularGlossinessTexture
    );
    const baseColor = specGloss.diffuseFactor ?? pbr?.baseColorFactor ?? [1, 1, 1, 1];
    const baseColorTextureName = textureNameFromGltfInfo(
      context,
      specGloss.diffuseTexture ?? pbr?.baseColorTexture
    );
    const metallicRoughnessTextureName = textureNameFromGltfInfo(
      context,
      pbr?.metallicRoughnessTexture
    );
    const specGlossTextureName = textureNameFromGltfInfo(
      context,
      specGloss.specularGlossinessTexture
    );
    const specularExtension = readGltfSpecularExtension(material.extensions);
    const specularTextureName =
      specGlossTextureName ?? textureNameFromGltfInfo(context, specularExtension.texture);
    const roughness = usesSpecGloss
      ? clamp(1 - (specGloss.glossinessFactor ?? 1), 0.02, 1)
      : pbr?.roughnessFactor ?? 1;

    return {
      alphaMode: material.alphaMode ?? (baseColor[3] < 0.999 ? "BLEND" : "OPAQUE"),
      baseColor: [baseColor[0], baseColor[1], baseColor[2], baseColor[3]],
      baseColorTextureName,
      bumpTextureName: null,
      diffuseTextureName: baseColorTextureName,
      emissiveColor: material.emissiveFactor ? [...material.emissiveFactor] : null,
      emissiveTextureName: textureNameFromGltfInfo(context, material.emissiveTexture),
      glossinessTextureName: usesSpecGloss ? specGlossTextureName : null,
      heightTextureName: null,
      metallic: usesSpecGloss ? 0 : pbr?.metallicFactor ?? 1,
      metallicTextureChannel: "b",
      metallicTextureName: usesSpecGloss ? null : metallicRoughnessTextureName,
      name: material.name?.trim() || `Material ${index + 1}`,
      normalTextureName: textureNameFromGltfInfo(context, material.normalTexture),
      occlusionTextureName: textureNameFromGltfInfo(context, material.occlusionTexture),
      opacity: baseColor[3],
      roughness,
      roughnessTextureChannel: usesSpecGloss ? "a" : "g",
      roughnessTextureName: usesSpecGloss ? null : metallicRoughnessTextureName,
      shininess: usesSpecGloss ? 64 : null,
      specularColor: specGloss.specularFactor ?? specularExtension.color,
      specularTextureName
    };
  });
}

function readGltfSpecularGlossinessExtension(
  extensions: Record<string, unknown> | undefined
) {
  const extension = extensions?.KHR_materials_pbrSpecularGlossiness as
    | GltfSpecularGlossinessExtension
    | undefined;

  return {
    diffuseFactor: extension?.diffuseFactor ?? null,
    diffuseTexture: extension?.diffuseTexture,
    glossinessFactor: extension?.glossinessFactor ?? null,
    specularFactor: extension?.specularFactor ?? null,
    specularGlossinessTexture: extension?.specularGlossinessTexture
  };
}

function readGltfSpecularExtension(extensions: Record<string, unknown> | undefined) {
  const extension = extensions?.KHR_materials_specular as
    | {
        specularColorFactor?: [number, number, number];
        specularColorTexture?: GltfTextureInfo;
        specularFactor?: number;
        specularTexture?: GltfTextureInfo;
      }
    | undefined;

  return {
    color: extension?.specularColorFactor ?? null,
    texture: extension?.specularColorTexture ?? extension?.specularTexture
  };
}

function createGltfParts(
  context: GltfImportContext,
  materials: Imported3DMaterial[]
): Imported3DPart[] {
  const parts: Imported3DPart[] = [];
  const meshReferences = getGltfSceneMeshReferences(context.gltf);

  for (const meshReference of meshReferences) {
    const mesh = context.gltf.meshes?.[meshReference.meshIndex];

    if (!mesh) {
      continue;
    }

    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      if ((primitive.mode ?? 4) !== 4) {
        context.warnings.push(`glTF primitive "${mesh.name || meshReference.meshIndex}:${primitiveIndex}" is not triangles and was skipped.`);
        continue;
      }

      const attributes = primitive.attributes ?? {};
      const positionAccessor = attributes.POSITION;

      if (positionAccessor === undefined) {
        continue;
      }

      const positions = readGltfAccessor(context, positionAccessor);
      const normals =
        attributes.NORMAL === undefined ? null : readGltfAccessor(context, attributes.NORMAL);
      const texCoords =
        attributes.TEXCOORD_0 === undefined ? null : readGltfAccessor(context, attributes.TEXCOORD_0);
      const colors =
        attributes.COLOR_0 === undefined ? null : readGltfAccessor(context, attributes.COLOR_0);
      const indices =
        primitive.indices === undefined ? null : readGltfAccessor(context, primitive.indices);
      const indexValues =
        indices?.values ?? Array.from({ length: positions.count }, (_, index) => index);
      const material = primitive.material === undefined ? null : materials[primitive.material] ?? null;
      const builder: PartBuilder = {
        colors: [],
        materialName: material?.name ?? null,
        name: `${mesh.name || "glTF mesh"} ${primitiveIndex + 1}`,
        normals: [],
        texCoords: [],
        vertices: []
      };

      for (let index = 0; index + 2 < indexValues.length; index += 3) {
        for (const vertexIndex of [indexValues[index], indexValues[index + 1], indexValues[index + 2]]) {
          pushAccessorVertex(
            builder,
            positions,
            normals,
            texCoords,
            colors,
            vertexIndex,
            meshReference.matrix
          );
        }
      }

      if (builder.vertices.length >= 9) {
        parts.push(toImportedPart(builder));
      }
    }
  }

  return parts;
}

function getGltfSceneMeshReferences(gltf: GltfRoot) {
  const meshReferences: Array<{ matrix: number[]; meshIndex: number }> = [];
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const rootNodes = scene?.nodes ?? gltf.nodes?.map((_, index) => index) ?? [];

  function visitNode(nodeIndex: number, parentMatrix: number[]) {
    const node = gltf.nodes?.[nodeIndex];

    if (!node) {
      return;
    }

    const matrix = multiply4(parentMatrix, getGltfNodeLocalMatrix(node));

    if (node.mesh !== undefined) {
      meshReferences.push({ matrix, meshIndex: node.mesh });
    }

    for (const child of node.children ?? []) {
      visitNode(child, matrix);
    }
  }

  for (const nodeIndex of rootNodes) {
    visitNode(nodeIndex, identity4());
  }

  if (meshReferences.length === 0) {
    gltf.meshes?.forEach((_, index) =>
      meshReferences.push({ matrix: identity4(), meshIndex: index })
    );
  }

  return meshReferences;
}

function readGltfAccessor(context: GltfImportContext, accessorIndex: number): GltfAccessorData {
  const accessor = context.gltf.accessors?.[accessorIndex];

  if (!accessor) {
    throw new Error(`Missing glTF accessor ${accessorIndex}.`);
  }

  const componentCount = getGltfAccessorComponentCount(accessor.type);
  const values: number[] = [];

  if (accessor.bufferView === undefined) {
    return {
      componentCount,
      count: accessor.count,
      values: Array(accessor.count * componentCount).fill(0)
    };
  }

  const bufferView = context.gltf.bufferViews?.[accessor.bufferView];

  if (!bufferView) {
    throw new Error(`Missing glTF bufferView ${accessor.bufferView}.`);
  }

  const buffer = context.buffers[bufferView.buffer];
  const componentSize = getGltfComponentSize(accessor.componentType);
  const elementSize = componentSize * componentCount;
  const stride = bufferView.byteStride ?? elementSize;
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  for (let index = 0; index < accessor.count; index += 1) {
    const elementOffset = baseOffset + index * stride;

    for (let component = 0; component < componentCount; component += 1) {
      values.push(
        readGltfComponent(
          view,
          elementOffset + component * componentSize,
          accessor.componentType,
          Boolean(accessor.normalized)
        )
      );
    }
  }

  return {
    componentCount,
    count: accessor.count,
    values
  };
}

async function importStlModel(asset: ModelAssetFile): Promise<Imported3DModel> {
  const bytes = new Uint8Array(await asset.file.arrayBuffer());
  const asciiPrefix = new TextDecoder("utf-8").decode(bytes.subarray(0, Math.min(bytes.length, 80))).trimStart();
  const builder = asciiPrefix.startsWith("solid") && !looksLikeBinaryStl(bytes)
    ? parseAsciiStl(await asset.file.text())
    : parseBinaryStl(bytes);

  return finalizeImportedModel({
    materials: [createDefaultMaterial("STL default")],
    name: stripExtension(asset.file.name) || "Imported STL model",
    parts: [toImportedPart(builder)],
    sourceFormat: "stl",
    textures: [],
    warnings: ["STL has no material texture data; a default material was applied."]
  });
}

function parseBinaryStl(bytes: Uint8Array): PartBuilder {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  const builder = createPartBuilder("STL mesh", "STL default");
  let offset = 84;

  for (let triangle = 0; triangle < triangleCount && offset + 50 <= bytes.byteLength; triangle += 1) {
    const normal = [
      view.getFloat32(offset, true),
      view.getFloat32(offset + 4, true),
      view.getFloat32(offset + 8, true)
    ];

    offset += 12;

    for (let vertex = 0; vertex < 3; vertex += 1) {
      builder.vertices.push(
        view.getFloat32(offset, true),
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true)
      );
      builder.normals.push(...normal);
      builder.texCoords.push(0, 0);
      offset += 12;
    }

    offset += 2;
  }

  return builder;
}

function parseAsciiStl(source: string): PartBuilder {
  const builder = createPartBuilder("STL mesh", "STL default");
  let normal = [0, 0, 1];
  const triangle: number[][] = [];

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    const [keyword, ...values] = line.split(/\s+/u);

    if (keyword === "facet" && values[0] === "normal") {
      normal = normalize3(values.slice(1, 4).map(Number));
      continue;
    }

    if (keyword === "vertex") {
      const position = values.slice(0, 3).map(Number);

      if (position.every(Number.isFinite)) {
        triangle.push(position);
      }

      if (triangle.length === 3) {
        for (const position of triangle) {
          builder.vertices.push(position[0], position[1], position[2]);
          builder.normals.push(normal[0], normal[1], normal[2]);
          builder.texCoords.push(0, 0);
        }

        triangle.length = 0;
      }
    }
  }

  return builder;
}

async function importPlyModel(asset: ModelAssetFile): Promise<Imported3DModel> {
  const bytes = new Uint8Array(await asset.file.arrayBuffer());
  const headerEnd = findPlyHeaderEnd(bytes);

  if (headerEnd < 0) {
    throw new Error("The PLY file header could not be read.");
  }

  const header = new TextDecoder("utf-8").decode(bytes.subarray(0, headerEnd));
  const parsedHeader = parsePlyHeader(header);
  const builder =
    parsedHeader.format === "ascii"
      ? parseAsciiPly(new TextDecoder("utf-8").decode(bytes.subarray(headerEnd)), parsedHeader)
      : parseBinaryPly(bytes.subarray(headerEnd), parsedHeader);
  const warnings = parsedHeader.hasVertexColors
    ? ["PLY vertex colors imported."]
    : ["PLY has no material texture data; a default material was applied."];

  return finalizeImportedModel({
    materials: [createDefaultMaterial("PLY default")],
    name: stripExtension(asset.file.name) || "Imported PLY model",
    parts: [toImportedPart(builder)],
    sourceFormat: "ply",
    textures: [],
    warnings
  });
}

type PlyHeader = {
  faceCount: number;
  faceIndexType: string;
  faceListCountType: string;
  format: "ascii" | "binary_little_endian";
  hasVertexColors: boolean;
  vertexCount: number;
  vertexProperties: Array<{ name: string; type: string }>;
};

function parsePlyHeader(header: string): PlyHeader {
  const lines = header.split(/\r?\n/u);
  let format: PlyHeader["format"] = "ascii";
  let vertexCount = 0;
  let faceCount = 0;
  let currentElement: string | null = null;
  let faceListCountType = "uchar";
  let faceIndexType = "int";
  const vertexProperties: PlyHeader["vertexProperties"] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/u);

    if (parts[0] === "format") {
      format = parts[1] === "binary_little_endian" ? "binary_little_endian" : "ascii";
    } else if (parts[0] === "element") {
      currentElement = parts[1];
      if (parts[1] === "vertex") {
        vertexCount = Number(parts[2]) || 0;
      } else if (parts[1] === "face") {
        faceCount = Number(parts[2]) || 0;
      }
    } else if (parts[0] === "property" && currentElement === "vertex") {
      vertexProperties.push({ name: parts.at(-1) ?? "", type: parts[1] });
    } else if (parts[0] === "property" && currentElement === "face" && parts[1] === "list") {
      faceListCountType = parts[2];
      faceIndexType = parts[3];
    }
  }

  return {
    faceCount,
    faceIndexType,
    faceListCountType,
    format,
    hasVertexColors: vertexProperties.some((property) =>
      ["red", "green", "blue", "alpha", "diffuse_red", "diffuse_green", "diffuse_blue"].includes(property.name)
    ),
    vertexCount,
    vertexProperties
  };
}

function parseAsciiPly(body: string, header: PlyHeader): PartBuilder {
  const lines = body.trim().split(/\r?\n/u);
  const vertices = lines.slice(0, header.vertexCount).map((line) =>
    parsePlyVertex(line.trim().split(/\s+/u), header.vertexProperties)
  );
  const builder = createPartBuilder("PLY mesh", "PLY default");

  for (const line of lines.slice(header.vertexCount, header.vertexCount + header.faceCount)) {
    const values = line.trim().split(/\s+/u).map(Number);
    const count = values[0] || 0;
    const indices = values.slice(1, 1 + count);

    pushPlyFace(builder, vertices, indices);
  }

  return builder;
}

function parseBinaryPly(bytes: Uint8Array, header: PlyHeader): PartBuilder {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vertices: ReturnType<typeof parsePlyVertex>[] = [];
  let offset = 0;

  for (let index = 0; index < header.vertexCount; index += 1) {
    const values: string[] = [];

    for (const property of header.vertexProperties) {
      const result = readPlyBinaryValue(view, offset, property.type);

      values.push(String(result.value));
      offset = result.nextOffset;
    }

    vertices.push(parsePlyVertex(values, header.vertexProperties));
  }

  const builder = createPartBuilder("PLY mesh", "PLY default");

  for (let face = 0; face < header.faceCount; face += 1) {
    const countResult = readPlyBinaryValue(view, offset, header.faceListCountType);
    const count = countResult.value;
    const indices: number[] = [];

    offset = countResult.nextOffset;

    for (let index = 0; index < count; index += 1) {
      const result = readPlyBinaryValue(view, offset, header.faceIndexType);

      indices.push(result.value);
      offset = result.nextOffset;
    }

    pushPlyFace(builder, vertices, indices);
  }

  return builder;
}

function parsePlyVertex(values: string[], properties: PlyHeader["vertexProperties"]) {
  const record = new Map<string, number>();

  properties.forEach((property, index) => record.set(property.name, Number(values[index])));

  const colorScale = Math.max(
    record.get("red") ?? record.get("diffuse_red") ?? 0,
    record.get("green") ?? record.get("diffuse_green") ?? 0,
    record.get("blue") ?? record.get("diffuse_blue") ?? 0,
    record.get("alpha") ?? 0
  ) > 1 ? 255 : 1;

  return {
    color: [
      clamp((record.get("red") ?? record.get("diffuse_red") ?? 255) / colorScale, 0, 1),
      clamp((record.get("green") ?? record.get("diffuse_green") ?? 255) / colorScale, 0, 1),
      clamp((record.get("blue") ?? record.get("diffuse_blue") ?? 255) / colorScale, 0, 1),
      clamp((record.get("alpha") ?? colorScale) / colorScale, 0, 1)
    ],
    normal: [record.get("nx") ?? 0, record.get("ny") ?? 0, record.get("nz") ?? 0],
    position: [record.get("x") ?? 0, record.get("y") ?? 0, record.get("z") ?? 0],
    texCoord: [record.get("s") ?? record.get("u") ?? 0, record.get("t") ?? record.get("v") ?? 0]
  };
}

function pushPlyFace(
  builder: PartBuilder,
  vertices: ReturnType<typeof parsePlyVertex>[],
  indices: number[]
) {
  for (let index = 1; index < indices.length - 1; index += 1) {
    for (const vertexIndex of [indices[0], indices[index], indices[index + 1]]) {
      const vertex = vertices[vertexIndex];

      if (!vertex) {
        continue;
      }

      builder.vertices.push(vertex.position[0], vertex.position[1], vertex.position[2]);
      builder.normals.push(vertex.normal[0], vertex.normal[1], vertex.normal[2]);
      builder.texCoords.push(vertex.texCoord[0], vertex.texCoord[1]);
      builder.colors.push(vertex.color[0], vertex.color[1], vertex.color[2], vertex.color[3]);
    }
  }
}

function finalizeImportedModel(input: {
  materials: Imported3DMaterial[];
  name: string;
  parts: Imported3DPart[];
  sourceFormat: Imported3DSourceFormat;
  textures: Imported3DTexture[];
  warnings: string[];
}): Imported3DModel {
  const parts = input.parts.length > 0 ? input.parts : [createFallbackPart()];

  normalizeModelVertices(parts);

  for (const part of parts) {
    ensurePartArrays(part);
    generateMissingNormals(part);
  }

  const materials = input.materials.length > 0 ? input.materials : [createDefaultMaterial(defaultMaterialName)];
  const materialByName = new Map(materials.map((material) => [material.name.toLowerCase(), material]));
  const assignedTextureMaps: string[] = [];
  const guessedTextureMaps: string[] = [];
  const visuallyUnsupportedMaps: string[] = [];
  const assignedTextureNames = new Set<string>();

  for (const material of materials) {
    for (const slot of getMaterialTextureSlots()) {
      const textureName = material[slot];

      if (!textureName) {
        continue;
      }

      assignedTextureNames.add(textureName);
      assignedTextureMaps.push(`${material.name}: ${formatTextureSlot(slot)} -> ${textureName}`);

      if (material.guessedTextureNames?.includes(textureName)) {
        guessedTextureMaps.push(`${material.name}: ${formatTextureSlot(slot)} -> ${textureName}`);
      }

      if (slot === "heightTextureName" || slot === "occlusionTextureName") {
        visuallyUnsupportedMaps.push(`${material.name}: ${formatTextureSlot(slot)} is stored and listed but not rendered directly.`);
      }
    }
  }

  for (const part of parts) {
    const material = part.materialName ? materialByName.get(part.materialName.toLowerCase()) : null;

    if (material && (material.normalTextureName || material.bumpTextureName)) {
      part.tangents = generateTangents(part);
    }
  }

  const vertexCount = parts.reduce((sum, part) => sum + part.vertices.length / 3, 0);
  const triangleCount = Math.floor(vertexCount / 3);
  const unassignedTextureNames = input.textures
    .map((texture) => texture.name)
    .filter((name) => !assignedTextureNames.has(name));
  const warnings = [...input.warnings, ...visuallyUnsupportedMaps];

  return {
    materials,
    name: input.name || "Imported 3D model",
    parts,
    sourceFormat: input.sourceFormat,
    stats: {
      assignedTextureCount: assignedTextureNames.size,
      materialCount: materials.length,
      partCount: parts.length,
      textureCount: input.textures.length,
      triangleCount,
      vertexCount
    },
    summary: {
      assignedTextureMaps: [...new Set(assignedTextureMaps)],
      guessedTextureMaps: [...new Set(guessedTextureMaps)],
      loadedTextureNames: input.textures.map((texture) => texture.name),
      materialNames: materials.map((material) => material.name),
      unassignedTextureNames
    },
    textures: input.textures,
    warnings: [...new Set(warnings)]
  };
}

function applyConservativeTextureFallbacks(
  materials: Imported3DMaterial[],
  textures: Imported3DTexture[],
  warnings: string[]
) {
  const availableBaseTextures = textures.filter((texture) =>
    isLikelyBaseColorTextureName(texture.name)
  );

  for (const material of materials) {
    if (material.baseColorTextureName || material.diffuseTextureName) {
      continue;
    }

    const materialKey = normalizeSearchName(material.name);
    const guessed =
      availableBaseTextures.find((texture) =>
        normalizeSearchName(texture.name).includes(materialKey)
      ) ??
      chooseBestTextureNameMatch(material.name, availableBaseTextures) ??
      (materials.length === 1 && textures.length === 1 ? textures[0] : null);

    if (!guessed) {
      continue;
    }

    material.baseColorTextureName = guessed.name;
    material.diffuseTextureName = guessed.name;
    material.guessedTextureNames = [...(material.guessedTextureNames ?? []), guessed.name];
    warnings.push(`Guessed diffuse texture "${guessed.name}" for material "${material.name}" from the filename.`);
  }
}

function isLikelyBaseColorTextureName(name: string) {
  const normalized = name.toLowerCase();

  return (
    /(basecolor|base_color|base-colou?r|diffuse|albedo|color|colour|body)/iu.test(
      normalized
    ) || /(^|[._\-\s])a([._\-\s]|$)/iu.test(normalized)
  );
}

function chooseBestTextureNameMatch(
  materialName: string,
  textures: Imported3DTexture[]
) {
  let bestTexture: Imported3DTexture | null = null;
  let bestScore = 0;

  for (const texture of textures) {
    const score = scoreTextureNameForMaterial(materialName, texture.name);

    if (score > bestScore) {
      bestScore = score;
      bestTexture = texture;
    }
  }

  return bestScore >= 2 ? bestTexture : null;
}

function scoreTextureNameForMaterial(materialName: string, textureName: string) {
  const materialKey = normalizeSearchName(materialName);
  const textureKey = normalizeSearchName(textureName);

  if (textureKey.includes(materialKey)) {
    return 100;
  }

  const materialTokens = tokenizeAssetName(materialName).filter(
    (token) => !genericMaterialTokens.has(token)
  );
  const textureTokens = new Set(
    tokenizeAssetName(stripExtension(textureName)).filter(
      (token) => !baseColorTextureTokens.has(token)
    )
  );

  return materialTokens.reduce((score, token) => {
    if (!textureTokens.has(token)) {
      return score;
    }

    return score + (token.length >= 3 ? 2 : 1);
  }, 0);
}

const genericMaterialTokens = new Set([
  "default",
  "mat",
  "material",
  "metal",
  "plastic",
  "rubber",
  "glass",
  "paint",
  "shader"
]);

const baseColorTextureTokens = new Set([
  "a",
  "albedo",
  "base",
  "basecolor",
  "color",
  "colour",
  "diff",
  "diffuse",
  "jpg",
  "jpeg",
  "png",
  "texture",
  "tex"
]);

function tokenizeAssetName(name: string) {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/u, "")
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function createDefaultMaterial(name: string): Imported3DMaterial {
  return {
    alphaMode: "OPAQUE",
    baseColor: [0.76, 0.8, 0.82, 1],
    baseColorTextureName: null,
    bumpTextureName: null,
    diffuseTextureName: null,
    emissiveColor: null,
    emissiveTextureName: null,
    glossinessTextureName: null,
    heightTextureName: null,
    metallic: 0,
    metallicTextureChannel: "r",
    metallicTextureName: null,
    name,
    normalTextureName: null,
    occlusionTextureName: null,
    opacity: 1,
    roughness: 0.52,
    roughnessTextureChannel: "r",
    roughnessTextureName: null,
    shininess: 32,
    specularColor: [0.22, 0.22, 0.22],
    specularTextureName: null
  };
}

function createMtlDefaultMaterial(name: string): MtlMaterial {
  return {
    baseColor: [0.76, 0.8, 0.82, 1],
    emissiveColor: null,
    maps: {},
    metallic: null,
    name,
    opacity: 1,
    roughness: null,
    shininess: null,
    specularColor: null
  };
}

async function expandModelAssetFiles(files: File[]): Promise<ModelAssetFile[]> {
  const expanded: ModelAssetFile[] = [];

  for (const file of files) {
    if (isZipFile(file)) {
      expanded.push(...(await extractZipModelAssets(file)));
      continue;
    }

    expanded.push({
      file,
      path: normalizeAssetPath(file.webkitRelativePath || file.name)
    });
  }

  return expanded.filter((asset) => isSupported3DImportFile(asset.file));
}

function choosePrimaryModelAsset(assets: ModelAssetFile[]) {
  const modelAssets = assets.filter((asset) => modelExtensions.test(asset.path));
  const preference = ["glb", "gltf", "obj", "stl", "ply", "fbx", "dae", "3ds"];

  return (
    modelAssets.sort((left, right) => {
      const leftRank = preference.indexOf(getFileExtension(left.path));
      const rightRank = preference.indexOf(getFileExtension(right.path));
      const rankDelta = (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank);

      return rankDelta || left.path.split("/").length - right.path.split("/").length;
    })[0] ?? null
  );
}

async function loadAssetTextures(assets: ModelAssetFile[], flipY: boolean) {
  const textures: Imported3DTexture[] = [];
  const usedNames = new Set<string>();

  for (const asset of assets) {
    try {
      const dataUrl = await fileToDataUrl(asset.file);
      const image = await loadImageElement(dataUrl);
      const name = uniqueAssetName(getAssetBasename(asset.path), usedNames);

      textures.push({
        dataUrl,
        flipY,
        height: image.naturalHeight || image.height,
        id: crypto.randomUUID(),
        image,
        mimeType: asset.file.type || getMimeTypeFromFilename(asset.file.name),
        name,
        path: asset.path,
        width: image.naturalWidth || image.width
      });
    } catch {
      // Broken image files are reported as unassigned by omission; model geometry can still load.
    }
  }

  return textures;
}

function parseObjMaterialHints(source: string) {
  const mtlNames: string[] = [];
  const usedMaterials: string[] = [];

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const [keyword] = line.split(/\s+/u);
    const lowerKeyword = keyword.toLowerCase();
    const value = line.slice(keyword.length).trim();

    if (lowerKeyword === "mtllib" && value) {
      pushAssetReferences(mtlNames, value);
    } else if (lowerKeyword === "usemtl" && value) {
      usedMaterials.push(stripAssetReferenceQuotes(value));
    }
  }

  return { mtlNames, usedMaterials };
}

function pushObjTriangle(
  part: PartBuilder,
  face: ObjFaceVertex[],
  positions: number[][],
  texCoords: number[][],
  normals: number[][]
) {
  const p0 = positions[face[0].positionIndex];
  const p1 = positions[face[1].positionIndex];
  const p2 = positions[face[2].positionIndex];

  if (!p0 || !p1 || !p2) {
    return;
  }

  const faceNormal = getFaceNormal(p0, p1, p2);

  for (const vertex of face) {
    const position = positions[vertex.positionIndex];

    if (!position) {
      return;
    }

    const normal =
      vertex.normalIndex === null ? faceNormal : normals[vertex.normalIndex] ?? faceNormal;
    const texCoord =
      vertex.texCoordIndex === null ? [0, 0] : texCoords[vertex.texCoordIndex] ?? [0, 0];

    part.vertices.push(position[0], position[1], position[2]);
    part.normals.push(normal[0], normal[1], normal[2]);
    part.texCoords.push(texCoord[0], texCoord[1]);
  }
}

function parseObjFaceVertex(
  token: string,
  positionCount: number,
  texCoordCount: number,
  normalCount: number
): ObjFaceVertex | null {
  const [positionRaw, texCoordRaw, normalRaw] = token.split("/");
  const positionIndex = resolveObjIndex(positionRaw, positionCount);

  if (positionIndex === null) {
    return null;
  }

  return {
    normalIndex: normalRaw ? resolveObjIndex(normalRaw, normalCount) : null,
    positionIndex,
    texCoordIndex: texCoordRaw ? resolveObjIndex(texCoordRaw, texCoordCount) : null
  };
}

function resolveObjIndex(value: string | undefined, count: number) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }

  const index = parsed > 0 ? parsed - 1 : count + parsed;

  return index >= 0 && index < count ? index : null;
}

function toImportedPart(part: PartBuilder): Imported3DPart {
  return {
    colors: part.colors.length === (part.vertices.length / 3) * 4 ? new Float32Array(part.colors) : undefined,
    materialName: part.materialName,
    name: part.name,
    normals: new Float32Array(part.normals),
    texCoords: new Float32Array(part.texCoords),
    vertices: new Float32Array(part.vertices)
  };
}

function createPartBuilder(name: string, materialName: string | null): PartBuilder {
  return {
    colors: [],
    materialName,
    name,
    normals: [],
    texCoords: [],
    vertices: []
  };
}

function createFallbackPart(): Imported3DPart {
  const builder = createPartBuilder("Fallback cube", defaultMaterialName);
  const faces = [
    { normal: [0, 0, 1], points: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { normal: [0, 0, -1], points: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { normal: [1, 0, 0], points: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { normal: [-1, 0, 0], points: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { normal: [0, 1, 0], points: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { normal: [0, -1, 0], points: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] }
  ];

  for (const face of faces) {
    pushQuad(builder, face.points, face.normal);
  }

  return toImportedPart(builder);
}

function pushQuad(builder: PartBuilder, points: number[][], normal: number[]) {
  const triangles = [
    [0, 1, 2, [0, 0], [1, 0], [1, 1]],
    [0, 2, 3, [0, 0], [1, 1], [0, 1]]
  ] as const;

  for (const triangle of triangles) {
    for (let index = 0; index < 3; index += 1) {
      const point = points[triangle[index] as number];
      const uv = triangle[index + 3] as readonly [number, number];

      builder.vertices.push(point[0], point[1], point[2]);
      builder.normals.push(normal[0], normal[1], normal[2]);
      builder.texCoords.push(uv[0], uv[1]);
    }
  }
}

function pushAccessorVertex(
  builder: PartBuilder,
  positions: GltfAccessorData,
  normals: GltfAccessorData | null,
  texCoords: GltfAccessorData | null,
  colors: GltfAccessorData | null,
  vertexIndex: number,
  matrix: number[] = identity4()
) {
  const positionOffset = vertexIndex * positions.componentCount;
  const position = transformPosition3(
    matrix,
    [
      positions.values[positionOffset] ?? 0,
      positions.values[positionOffset + 1] ?? 0,
      positions.values[positionOffset + 2] ?? 0
    ]
  );

  builder.vertices.push(position[0], position[1], position[2]);

  if (normals) {
    const normalOffset = vertexIndex * normals.componentCount;
    const normal = transformDirection3(matrix, [
      normals.values[normalOffset] ?? 0,
      normals.values[normalOffset + 1] ?? 0,
      normals.values[normalOffset + 2] ?? 0
    ]);

    builder.normals.push(normal[0], normal[1], normal[2]);
  } else {
    builder.normals.push(0, 0, 0);
  }

  if (texCoords) {
    const texCoordOffset = vertexIndex * texCoords.componentCount;
    builder.texCoords.push(texCoords.values[texCoordOffset] ?? 0, texCoords.values[texCoordOffset + 1] ?? 0);
  } else {
    builder.texCoords.push(0, 0);
  }

  if (colors) {
    const colorOffset = vertexIndex * colors.componentCount;
    builder.colors.push(
      colors.values[colorOffset] ?? 1,
      colors.values[colorOffset + 1] ?? 1,
      colors.values[colorOffset + 2] ?? 1,
      colors.componentCount > 3 ? colors.values[colorOffset + 3] ?? 1 : 1
    );
  }
}

function ensurePartArrays(part: Imported3DPart) {
  const vertexCount = part.vertices.length / 3;

  if (part.normals.length !== vertexCount * 3) {
    part.normals = new Float32Array(vertexCount * 3);
  }

  if (part.texCoords.length !== vertexCount * 2) {
    part.texCoords = new Float32Array(vertexCount * 2);
  }

  if (part.colors && part.colors.length !== vertexCount * 4) {
    part.colors = undefined;
  }
}

function generateMissingNormals(part: Imported3DPart) {
  let hasUsableNormals = false;

  for (let index = 0; index < part.normals.length; index += 3) {
    if (Math.hypot(part.normals[index], part.normals[index + 1], part.normals[index + 2]) > 0.001) {
      hasUsableNormals = true;
      break;
    }
  }

  if (hasUsableNormals) {
    return;
  }

  const normals = new Float32Array(part.vertices.length);

  for (let index = 0; index + 8 < part.vertices.length; index += 9) {
    const normal = getFaceNormal(
      [part.vertices[index], part.vertices[index + 1], part.vertices[index + 2]],
      [part.vertices[index + 3], part.vertices[index + 4], part.vertices[index + 5]],
      [part.vertices[index + 6], part.vertices[index + 7], part.vertices[index + 8]]
    );

    normals.set(normal, index);
    normals.set(normal, index + 3);
    normals.set(normal, index + 6);
  }

  part.normals = normals;
}

function generateTangents(part: Imported3DPart) {
  const vertexCount = part.vertices.length / 3;
  const tangents = new Float32Array(vertexCount * 3);

  for (let vertex = 0; vertex + 2 < vertexCount; vertex += 3) {
    const i0 = vertex;
    const i1 = vertex + 1;
    const i2 = vertex + 2;
    const p0 = readVec3(part.vertices, i0);
    const p1 = readVec3(part.vertices, i1);
    const p2 = readVec3(part.vertices, i2);
    const uv0 = readVec2(part.texCoords, i0);
    const uv1 = readVec2(part.texCoords, i1);
    const uv2 = readVec2(part.texCoords, i2);
    const x1 = p1[0] - p0[0];
    const x2 = p2[0] - p0[0];
    const y1 = p1[1] - p0[1];
    const y2 = p2[1] - p0[1];
    const z1 = p1[2] - p0[2];
    const z2 = p2[2] - p0[2];
    const s1 = uv1[0] - uv0[0];
    const s2 = uv2[0] - uv0[0];
    const t1 = uv1[1] - uv0[1];
    const t2 = uv2[1] - uv0[1];
    const denominator = s1 * t2 - s2 * t1;
    const tangent =
      Math.abs(denominator) > 1e-6
        ? normalize3([
            (t2 * x1 - t1 * x2) / denominator,
            (t2 * y1 - t1 * y2) / denominator,
            (t2 * z1 - t1 * z2) / denominator
          ])
        : [1, 0, 0];

    tangents.set(tangent, i0 * 3);
    tangents.set(tangent, i1 * 3);
    tangents.set(tangent, i2 * 3);
  }

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const normal = readVec3(part.normals, vertex);
    const tangent = readVec3(tangents, vertex);
    const dotValue = dot3(normal, tangent);
    const orthogonal = normalize3([
      tangent[0] - normal[0] * dotValue,
      tangent[1] - normal[1] * dotValue,
      tangent[2] - normal[2] * dotValue
    ]);

    tangents.set(orthogonal, vertex * 3);
  }

  return tangents;
}

function normalizeModelVertices(parts: Imported3DPart[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const part of parts) {
    for (let index = 0; index < part.vertices.length; index += 3) {
      minX = Math.min(minX, part.vertices[index]);
      minY = Math.min(minY, part.vertices[index + 1]);
      minZ = Math.min(minZ, part.vertices[index + 2]);
      maxX = Math.max(maxX, part.vertices[index]);
      maxY = Math.max(maxY, part.vertices[index + 1]);
      maxZ = Math.max(maxZ, part.vertices[index + 2]);
    }
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const largestSide = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const scale = 2 / largestSide;

  for (const part of parts) {
    for (let index = 0; index < part.vertices.length; index += 3) {
      part.vertices[index] = (part.vertices[index] - centerX) * scale;
      part.vertices[index + 1] = (part.vertices[index + 1] - centerY) * scale;
      part.vertices[index + 2] = (part.vertices[index + 2] - centerZ) * scale;
    }
  }
}

function getMaterialTextureSlots() {
  return [
    "diffuseTextureName",
    "baseColorTextureName",
    "specularTextureName",
    "glossinessTextureName",
    "roughnessTextureName",
    "metallicTextureName",
    "normalTextureName",
    "bumpTextureName",
    "heightTextureName",
    "emissiveTextureName",
    "occlusionTextureName"
  ] as const;
}

function formatTextureSlot(slot: ReturnType<typeof getMaterialTextureSlots>[number]) {
  return slot.replace(/TextureName$/u, "").replace(/([A-Z])/gu, " $1").toLowerCase();
}

function textureNameFromGltfInfo(context: GltfImportContext, info: GltfTextureInfo | null | undefined) {
  return info ? context.textureNameByTextureIndex.get(info.index) ?? null : null;
}

function getGltfBufferViewBytes(gltf: GltfRoot, buffers: Uint8Array[], bufferViewIndex: number) {
  const bufferView = gltf.bufferViews?.[bufferViewIndex];

  if (!bufferView) {
    throw new Error(`Missing glTF bufferView ${bufferViewIndex}.`);
  }

  const buffer = buffers[bufferView.buffer];
  const offset = bufferView.byteOffset ?? 0;

  return buffer.subarray(offset, offset + bufferView.byteLength);
}

function getGltfAccessorComponentCount(type: GltfAccessor["type"]) {
  switch (type) {
    case "SCALAR":
      return 1;
    case "VEC2":
      return 2;
    case "VEC3":
      return 3;
    case "VEC4":
    case "MAT2":
      return 4;
    case "MAT3":
      return 9;
    case "MAT4":
      return 16;
  }
}

function getGltfComponentSize(componentType: number) {
  switch (componentType) {
    case 5120:
    case 5121:
      return 1;
    case 5122:
    case 5123:
      return 2;
    case 5125:
    case 5126:
      return 4;
    default:
      throw new Error(`Unsupported glTF component type: ${componentType}`);
  }
}

function readGltfComponent(view: DataView, offset: number, componentType: number, normalized: boolean) {
  switch (componentType) {
    case 5120: {
      const value = view.getInt8(offset);
      return normalized ? Math.max(value / 127, -1) : value;
    }
    case 5121: {
      const value = view.getUint8(offset);
      return normalized ? value / 255 : value;
    }
    case 5122: {
      const value = view.getInt16(offset, true);
      return normalized ? Math.max(value / 32767, -1) : value;
    }
    case 5123: {
      const value = view.getUint16(offset, true);
      return normalized ? value / 65535 : value;
    }
    case 5125:
      return view.getUint32(offset, true);
    case 5126:
      return view.getFloat32(offset, true);
    default:
      throw new Error(`Unsupported glTF component type: ${componentType}`);
  }
}

function parseMtlTexturePath(line: string) {
  const [, ...tokens] = line.match(/"[^"]+"|'[^']+'|\S+/gu) ?? [];
  const pathTokens: string[] = [];
  const optionValueCounts: Record<string, number> = {
    "-blendu": 1,
    "-blendv": 1,
    "-bm": 1,
    "-boost": 1,
    "-cc": 1,
    "-clamp": 1,
    "-imfchan": 1,
    "-mm": 2,
    "-o": 3,
    "-s": 3,
    "-t": 3,
    "-texres": 1
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.startsWith("-")) {
      index += optionValueCounts[token.toLowerCase()] ?? 0;
      continue;
    }

    pathTokens.push(token);
  }

  return stripAssetReferenceQuotes(pathTokens.join(" ").trim() || (tokens.at(-1) ?? ""));
}

function findReferencedAsset(
  assets: ModelAssetFile[],
  baseDirectory: string,
  references: string[],
  predicate: (file: File) => boolean
) {
  for (const reference of references) {
    const cleanReference = stripAssetReferenceQuotes(reference);

    if (!cleanReference) {
      continue;
    }

    const resolvedPath = normalizeAssetPath(`${baseDirectory}/${cleanReference}`);
    const normalizedReference = normalizeAssetPath(cleanReference);
    const referenceName = getAssetBasename(normalizedReference).toLowerCase();
    const exact = assets.find(
      (asset) =>
        predicate(asset.file) &&
        normalizeAssetPath(asset.path).toLowerCase() === resolvedPath.toLowerCase()
    );

    if (exact) {
      return exact;
    }

    const loose = assets.find((asset) => {
      const assetPath = normalizeAssetPath(asset.path).toLowerCase();

      return (
        predicate(asset.file) &&
        (assetPath.endsWith(`/${normalizedReference}`.toLowerCase()) ||
          getAssetBasename(asset.path).toLowerCase() === referenceName)
      );
    });

    if (loose) {
      return loose;
    }
  }

  return null;
}

function findFirstAsset(
  assets: ModelAssetFile[],
  preferredDirectory: string,
  predicate: (file: File) => boolean
) {
  const candidates = assets.filter((asset) => predicate(asset.file));

  return (
    candidates.find((asset) => getAssetDirectory(asset.path) === preferredDirectory) ??
    candidates[0] ??
    null
  );
}

function parseColor3(value: string, fallback: [number, number, number]): [number, number, number] {
  const channels = value.split(/\s+/u).slice(0, 3).map(Number);

  if (channels.length !== 3 || !channels.every(Number.isFinite)) {
    return fallback;
  }

  return [clamp(channels[0], 0, 1), clamp(channels[1], 0, 1), clamp(channels[2], 0, 1)];
}

function shininessToRoughness(shininess: number) {
  return clamp(Math.sqrt(2 / (Math.max(0, shininess) + 2)), 0.02, 1);
}

function readVec3(values: Float32Array, vertexIndex: number): [number, number, number] {
  const offset = vertexIndex * 3;

  return [values[offset] ?? 0, values[offset + 1] ?? 0, values[offset + 2] ?? 0];
}

function readVec2(values: Float32Array, vertexIndex: number): [number, number] {
  const offset = vertexIndex * 2;

  return [values[offset] ?? 0, values[offset + 1] ?? 0];
}

function getFaceNormal(a: number[], b: number[], c: number[]) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];

  return normalize3([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
}

function normalize3(vector: number[]) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function dot3(left: number[], right: number[]) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function identity4() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiply4(a: number[], b: number[]) {
  const out = Array(16).fill(0);

  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }

  return out;
}

function getGltfNodeLocalMatrix(node: GltfNode) {
  if (node.matrix?.length === 16) {
    return [...node.matrix];
  }

  const translation = node.translation ?? [0, 0, 0];
  const rotation = node.rotation ?? [0, 0, 0, 1];
  const scale = node.scale ?? [1, 1, 1];
  const [x, y, z, w] = rotation;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return [
    (1 - (yy + zz)) * scale[0],
    (xy + wz) * scale[0],
    (xz - wy) * scale[0],
    0,
    (xy - wz) * scale[1],
    (1 - (xx + zz)) * scale[1],
    (yz + wx) * scale[1],
    0,
    (xz + wy) * scale[2],
    (yz - wx) * scale[2],
    (1 - (xx + yy)) * scale[2],
    0,
    translation[0],
    translation[1],
    translation[2],
    1
  ];
}

function transformPosition3(matrix: number[], point: [number, number, number]) {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14]
  ];
}

function transformDirection3(matrix: number[], vector: [number, number, number]) {
  return normalize3([
    matrix[0] * vector[0] + matrix[4] * vector[1] + matrix[8] * vector[2],
    matrix[1] * vector[0] + matrix[5] * vector[1] + matrix[9] * vector[2],
    matrix[2] * vector[0] + matrix[6] * vector[1] + matrix[10] * vector[2]
  ]);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/u, "");
}

function getFileExtension(path: string) {
  return (path.split(".").pop() ?? "").toLowerCase();
}

function extensionToSourceFormat(extension: string): Imported3DSourceFormat {
  if (
    extension === "obj" ||
    extension === "gltf" ||
    extension === "glb" ||
    extension === "stl" ||
    extension === "ply" ||
    extension === "fbx" ||
    extension === "dae" ||
    extension === "3ds"
  ) {
    return extension;
  }

  return "unknown";
}

function normalizeSearchName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function uniqueAssetName(name: string, usedNames: Set<string>) {
  const trimmed = name.trim() || "Texture";
  let nextName = trimmed;
  let index = 2;

  while (usedNames.has(nextName.toLowerCase())) {
    nextName = `${trimmed} ${index}`;
    index += 1;
  }

  usedNames.add(nextName.toLowerCase());

  return nextName;
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read file as data URL."));
      }
    };
    reader.onerror = () => reject(new Error("Unable to read file as data URL."));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob) {
  return fileToDataUrl(blob);
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
      image.onerror = () => reject(new Error("Unable to load model texture."));
    });
  }

  return image;
}

function decodeDataUri(uri: string) {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/u.exec(uri);

  if (!match) {
    throw new Error("Invalid data URI.");
  }

  const mimeType = match[1] || "application/octet-stream";
  const data = uri.includes(";base64,") ? atob(match[2]) : decodeURIComponent(match[2]);
  const bytes = new Uint8Array(data.length);

  for (let index = 0; index < data.length; index += 1) {
    bytes[index] = data.charCodeAt(index);
  }

  return { bytes, mimeType };
}

function findPlyHeaderEnd(bytes: Uint8Array) {
  const marker = new TextEncoder().encode("end_header");

  for (let offset = 0; offset <= bytes.length - marker.length; offset += 1) {
    let matches = true;

    for (let index = 0; index < marker.length; index += 1) {
      if (bytes[offset + index] !== marker[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      let end = offset + marker.length;

      while (end < bytes.length && (bytes[end] === 10 || bytes[end] === 13)) {
        end += 1;
      }

      return end;
    }
  }

  return -1;
}

function readPlyBinaryValue(view: DataView, offset: number, type: string) {
  switch (type) {
    case "char":
    case "int8":
      return { nextOffset: offset + 1, value: view.getInt8(offset) };
    case "uchar":
    case "uint8":
      return { nextOffset: offset + 1, value: view.getUint8(offset) };
    case "short":
    case "int16":
      return { nextOffset: offset + 2, value: view.getInt16(offset, true) };
    case "ushort":
    case "uint16":
      return { nextOffset: offset + 2, value: view.getUint16(offset, true) };
    case "uint":
    case "uint32":
      return { nextOffset: offset + 4, value: view.getUint32(offset, true) };
    case "float":
    case "float32":
      return { nextOffset: offset + 4, value: view.getFloat32(offset, true) };
    case "double":
    case "float64":
      return { nextOffset: offset + 8, value: view.getFloat64(offset, true) };
    case "int":
    case "int32":
    default:
      return { nextOffset: offset + 4, value: view.getInt32(offset, true) };
  }
}

function looksLikeBinaryStl(bytes: Uint8Array) {
  if (bytes.byteLength < 84) {
    return false;
  }

  const triangleCount = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);

  return 84 + triangleCount * 50 === bytes.byteLength;
}

async function extractZipModelAssets(file: File): Promise<ModelAssetFile[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);

  if (eocdOffset < 0) {
    throw new Error(`Unable to read ${file.name}. The zip directory was not found.`);
  }

  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const entries: ModelAssetFile[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      break;
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const path = normalizeAssetPath(
      new TextDecoder("utf-8").decode(bytes.subarray(offset + 46, offset + 46 + fileNameLength))
    );

    offset += 46 + fileNameLength + extraLength + commentLength;

    if (!path || path.endsWith("/") || !supportedPackageExtensions.test(path)) {
      continue;
    }

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const data = await inflateZipEntry(compressed, compressionMethod);
    const fileName = getAssetBasename(path);
    const extractedFile = new File([copyBytesToArrayBuffer(data)], fileName, {
      type: getMimeTypeFromFilename(fileName)
    });

    entries.push({ file: extractedFile, path });
  }

  return entries;
}

function findEndOfCentralDirectory(view: DataView) {
  const minimumOffset = Math.max(0, view.byteLength - 66_000);

  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  return -1;
}

async function inflateZipEntry(bytes: Uint8Array, compressionMethod: number) {
  if (compressionMethod === 0) {
    return bytes;
  }

  if (compressionMethod !== 8 || typeof DecompressionStream === "undefined") {
    throw new Error("This zip uses a compression method the browser cannot read.");
  }

  const stream = new Blob([copyBytesToArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();

  return new Uint8Array(buffer);
}

function copyBytesToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);

  return copy.buffer;
}

function normalizeAssetPath(path: string) {
  const parts: string[] = [];

  for (const part of path.replace(/\\/gu, "/").replace(/^\/+/u, "").split("/")) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return parts.join("/");
}

function getAssetDirectory(path: string) {
  const normalizedPath = normalizeAssetPath(path);
  const slashIndex = normalizedPath.lastIndexOf("/");

  return slashIndex >= 0 ? normalizedPath.slice(0, slashIndex) : "";
}

function getAssetBasename(path: string) {
  return normalizeAssetPath(path).split("/").pop() || path;
}

function stripAssetReferenceQuotes(reference: string) {
  return reference.trim().replace(/^["']|["']$/gu, "");
}

function pushAssetReferences(references: string[], value: string) {
  const cleanValue = stripAssetReferenceQuotes(value);

  if (cleanValue) {
    references.push(cleanValue);
  }

  for (const token of value.match(/"[^"]+"|'[^']+'|\S+/gu) ?? []) {
    const cleanToken = stripAssetReferenceQuotes(token);

    if (cleanToken && !references.includes(cleanToken)) {
      references.push(cleanToken);
    }
  }
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || imageExtensions.test(file.name);
}

function isMtlFile(file: File) {
  return /\.mtl$/iu.test(file.name);
}

function isZipFile(file: File) {
  return file.type === "application/zip" || /\.zip$/iu.test(file.name);
}

function getMimeTypeFromFilename(name: string) {
  const lowerName = name.toLowerCase();

  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lowerName.endsWith(".png")) {
    return "image/png";
  }

  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }

  if (lowerName.endsWith(".gif")) {
    return "image/gif";
  }

  if (lowerName.endsWith(".bmp")) {
    return "image/bmp";
  }

  if (lowerName.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (lowerName.endsWith(".glb")) {
    return "model/gltf-binary";
  }

  if (lowerName.endsWith(".gltf")) {
    return "model/gltf+json";
  }

  return "application/octet-stream";
}
