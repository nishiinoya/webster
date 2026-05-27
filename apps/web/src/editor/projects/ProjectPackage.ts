/** Import/export helpers for the native `.webster` project package format. */
import { ImageLayer } from "../layers/ImageLayer";
import type { SerializedObject3DModel, SerializedLayer } from "../layers/Layer";
import { Object3DLayer } from "../layers/Object3DLayer";
import { Scene, SerializedScene } from "../scene/Scene";
import type { SerializedProjectTemplateMetadata } from "../scene/sceneSerialization";
import type { Imported3DModel } from "../import3d/Imported3DModel";
import {
  serializeImported3DModelToAssets
} from "../import3d/Imported3DModel";
import { blobEntry, createZip, readZip, readZipText, textEntry } from "./ZipStore";
import type { ZipEntry } from "./ZipStore";

export type ProjectPackageProgress = {
  message: string;
  progress: number;
  title: string;
};

export type ProjectPackageOptions = {
  onProgress?: (state: ProjectPackageProgress) => void;
  reusableAssetEntries?: ReadonlyMap<string, ZipEntry>;
  skipAssetPaths?: ReadonlySet<string>;
};

export type SerializedScenePackageAssets = {
  assetEntries: ZipEntry[];
  manifest: SerializedScene;
};

export async function exportScenePackage(
  scene: Scene,
  templateMetadata?: SerializedProjectTemplateMetadata,
  options: ProjectPackageOptions = {}
) {
  const { assetEntries, manifest } = await serializeScenePackageAssets(
    scene,
    templateMetadata,
    options
  );
  const entries: ZipEntry[] = [...assetEntries];
  const entryNames = new Set(entries.map((entry) => entry.name));

  reportProgress(
    options,
    48,
    "Saving project...",
    "Packed layer data."
  );
  entries.unshift(textEntry("manifest.json", JSON.stringify(manifest, null, 2)));
  entryNames.add("manifest.json");
  entries.push(...getReusableAssetEntries(manifest, options.reusableAssetEntries, entryNames));

  reportProgress(options, 86, "Saving project...", "Writing Webster package.");
  return createZip(entries);
}

export async function serializeScenePackageAssets(
  scene: Scene,
  templateMetadata?: SerializedProjectTemplateMetadata,
  options: ProjectPackageOptions = {}
): Promise<SerializedScenePackageAssets> {
  const entries: ZipEntry[] = [];
  const modelReferences = new Map<string, SerializedObject3DModel>();

  reportProgress(options, 8, "Saving project...", "Collecting layers and shared assets.");
  const manifest = await serializeScenePackageManifest(scene, modelReferences, entries, options);

  if (templateMetadata) {
    manifest.template = templateMetadata;
  }

  reportProgress(
    options,
    48,
    "Saving project...",
    modelReferences.size > 0
      ? `Packed ${modelReferences.size} shared 3D model asset${modelReferences.size === 1 ? "" : "s"}.`
      : "Packed layer data."
  );
  await addFontAssetEntries(scene, manifest, entries, options);
  await addImageAssetEntries(scene, entries, options);

  return {
    assetEntries: entries,
    manifest
  };
}

async function addImageAssetEntries(
  scene: Scene,
  entries: ZipEntry[],
  options: ProjectPackageOptions
) {
  const addedAssets = new Set<string>();
  const imageLayers = scene.layers.filter((layer): layer is ImageLayer => layer instanceof ImageLayer);

  for (let index = 0; index < imageLayers.length; index += 1) {
    const layer = imageLayers[index];
    const layerJson = await layer.toJSON();

    reportProgress(
      options,
      55 + Math.round((index / Math.max(1, imageLayers.length)) * 22),
      "Saving project...",
      `Writing image asset ${index + 1} of ${imageLayers.length}.`
    );

    if (!addedAssets.has(layerJson.assetPath) && !options.skipAssetPaths?.has(layerJson.assetPath)) {
      entries.push(await blobEntry(layerJson.assetPath, await layer.toAssetBlob()));
      addedAssets.add(layerJson.assetPath);
    }

    if (
      layerJson.originalAssetPath &&
      !addedAssets.has(layerJson.originalAssetPath) &&
      !options.skipAssetPaths?.has(layerJson.originalAssetPath)
    ) {
      entries.push(
        await blobEntry(layerJson.originalAssetPath, await layer.toOriginalAssetBlob())
      );
      addedAssets.add(layerJson.originalAssetPath);
    }
  }
}

export async function readScenePackageManifest(file: Blob) {
  const entries = await readZip(file);

  return JSON.parse(await readZipText(entries, "manifest.json")) as SerializedScene;
}

export async function importScenePackage(file: Blob, options: ProjectPackageOptions = {}) {
  reportProgress(options, 8, "Opening project...", "Reading Webster package.");
  const entries = await readZip(file);
  reportProgress(options, 28, "Opening project...", "Reading project manifest.");
  const manifest = JSON.parse(await readZipText(entries, "manifest.json")) as SerializedScene;
  const assets = new Map(entries);
  const modelLayerCount = manifest.layers.filter(
    (layer) => layer.type === "object3d" && "model" in layer && layer.model
  ).length;

  for (const asset of manifest.layers) {
    if (asset.type === "image") {
      const blob = entries.get(asset.assetPath);

      if (blob) {
        assets.set(asset.assetPath, blob);
        assets.set(asset.assetId, blob);
      }

      if (asset.originalAssetPath) {
        const originalBlob = entries.get(asset.originalAssetPath);

        if (originalBlob) {
          assets.set(asset.originalAssetPath, originalBlob);
          assets.set(asset.originalAssetId ?? asset.originalAssetPath, originalBlob);
        }
      }
    }
  }

  reportProgress(
    options,
    45,
    "Opening project...",
    modelLayerCount > 0
      ? `Loading ${modelLayerCount} 3D model layer${modelLayerCount === 1 ? "" : "s"}.`
      : "Loading layers."
  );
  const scene = await Scene.fromJSON(manifest, assets);

  reportProgress(options, 86, "Opening project...", "Preparing embedded fonts.");
  for (const font of manifest.fonts ?? []) {
    const blob = entries.get(font.assetPath);

    if (blob) {
      scene.upsertFontAsset({
        ...font,
        blob
      });
    }
  }

  reportProgress(options, 100, "Opening project...", "Project loaded.");
  return scene;
}

async function serializeScenePackageManifest(
  scene: Scene,
  modelReferences: Map<string, SerializedObject3DModel>,
  entries: ZipEntry[],
  options: ProjectPackageOptions
): Promise<SerializedScene> {
  return {
    app: "webster",
    canvas: {
      background: scene.document.color,
      height: scene.document.height,
      width: scene.document.width,
      x: scene.document.x,
      y: scene.document.y
    },
    layers: await Promise.all(
      scene.layers.map((layer) => serializeLayerForPackage(layer, modelReferences, entries, options))
    ),
    selectedLayerId: scene.selectedLayerId,
    selectedLayerIds: scene.selectedLayerIds,
    version: 1
  };
}

async function serializeLayerForPackage(
  layer: Scene["layers"][number],
  modelReferences: Map<string, SerializedObject3DModel>,
  entries: ZipEntry[],
  options: ProjectPackageOptions
): Promise<SerializedLayer> {
  if (!(layer instanceof Object3DLayer) || !layer.importedModel) {
    return layer.toJSON();
  }

  return layer.toJSONWithModel(
    await getImportedModelAssetReference(layer.importedModel, modelReferences, entries, options)
  );
}

async function getImportedModelAssetReference(
  model: Imported3DModel,
  modelReferences: Map<string, SerializedObject3DModel>,
  entries: ZipEntry[],
  options: ProjectPackageOptions
): Promise<SerializedObject3DModel> {
  const key = model.id || `${model.sourceFormat}:${model.name}:${model.stats.vertexCount}:${model.stats.triangleCount}`;
  const existingReference = modelReferences.get(key);

  if (existingReference) {
    return existingReference;
  }

  const basePath = `assets/models/${sanitizeAssetPathSegment(key)}`;
  const assetPath = `${basePath}/model.json`;
  const reference = {
    assetPath,
    id: model.id,
    name: model.name,
    sourceFormat: model.sourceFormat,
    stats: { ...model.stats },
    version: 3
  } satisfies SerializedObject3DModel;

  if (options.skipAssetPaths?.has(assetPath)) {
    modelReferences.set(key, reference);

    return reference;
  }

  const serialized = await serializeImported3DModelToAssets(model, basePath);

  entries.push(textEntry(assetPath, JSON.stringify(serialized.model)));

  for (const asset of serialized.assets) {
    if (!options.skipAssetPaths?.has(asset.path)) {
      entries.push(await blobEntry(asset.path, asset.blob));
    }
  }

  modelReferences.set(key, reference);

  return reference;
}

async function addFontAssetEntries(
  scene: Scene,
  manifest: SerializedScene,
  entries: ZipEntry[],
  options: ProjectPackageOptions
) {
  if (scene.fontAssets.length === 0) {
    return;
  }

  manifest.fonts = scene.fontAssets.map((font) => ({
    assetPath: font.assetPath,
    family: font.family,
    id: font.id,
    italic: font.italic,
    mimeType: font.mimeType,
    name: font.name,
    style: font.style,
    weight: font.weight
  }));

  for (const font of scene.fontAssets) {
    if (!options.skipAssetPaths?.has(font.assetPath)) {
      entries.push(await blobEntry(font.assetPath, font.blob));
    }
  }
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

function reportProgress(
  options: ProjectPackageOptions,
  progress: number,
  title: string,
  message: string
) {
  options.onProgress?.({
    message,
    progress,
    title
  });
}

function getReusableAssetEntries(
  manifest: SerializedScene,
  reusableAssetEntries: ReadonlyMap<string, ZipEntry> | undefined,
  existingEntryNames: Set<string>
) {
  if (!reusableAssetEntries) {
    return [];
  }

  const reusableEntries: ZipEntry[] = [];
  const reusableAssetPaths = getReferencedPackageAssetPaths(manifest, reusableAssetEntries);

  for (const assetPath of reusableAssetPaths) {
    const entry = reusableAssetEntries.get(assetPath);

    if (!entry || existingEntryNames.has(entry.name)) {
      continue;
    }

    reusableEntries.push(entry);
    existingEntryNames.add(entry.name);
  }

  return reusableEntries;
}

function getReferencedPackageAssetPaths(
  manifest: SerializedScene,
  reusableAssetEntries: ReadonlyMap<string, ZipEntry>
) {
  const assetPaths = new Set<string>();

  for (const layer of manifest.layers) {
    if (layer.type === "image") {
      assetPaths.add(layer.assetPath);

      if (layer.originalAssetPath) {
        assetPaths.add(layer.originalAssetPath);
      }
    }

    if (layer.type === "object3d" && layer.model && "assetPath" in layer.model) {
      const assetPath = layer.model.assetPath;
      const modelDirectory = assetPath.replace(/\/[^/]*$/u, "");

      for (const entryName of reusableAssetEntries.keys()) {
        if (entryName === assetPath || entryName.startsWith(`${modelDirectory}/`)) {
          assetPaths.add(entryName);
        }
      }
    }
  }

  for (const font of manifest.fonts ?? []) {
    assetPaths.add(font.assetPath);
  }

  return assetPaths;
}
