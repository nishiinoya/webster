/** Import/export helpers for the native `.webster` project package format. */
import { ImageLayer } from "../layers/ImageLayer";
import { Scene, SerializedScene } from "../scene/Scene";
import type { SerializedProjectTemplateMetadata } from "../scene/sceneSerialization";
import { blobEntry, createZip, readZip, readZipText, textEntry } from "./ZipStore";

export async function exportScenePackage(
  scene: Scene,
  templateMetadata?: SerializedProjectTemplateMetadata
) {
  const manifest = await scene.toJSON();

  if (templateMetadata) {
    manifest.template = templateMetadata;
  }

  const entries = [textEntry("manifest.json", JSON.stringify(manifest, null, 2))];
  const addedAssets = new Set<string>();

  for (const layer of scene.layers) {
    if (layer instanceof ImageLayer) {
      const layerJson = await layer.toJSON();

      if (addedAssets.has(layerJson.assetPath)) {
        continue;
      }

      entries.push(await blobEntry(layerJson.assetPath, await layer.toAssetBlob()));
      addedAssets.add(layerJson.assetPath);

      if (layerJson.originalAssetPath && !addedAssets.has(layerJson.originalAssetPath)) {
        entries.push(
          await blobEntry(layerJson.originalAssetPath, await layer.toOriginalAssetBlob())
        );
        addedAssets.add(layerJson.originalAssetPath);
      }
    }
  }

  return createZip(entries);
}

export async function readScenePackageManifest(file: Blob) {
  const entries = await readZip(file);

  return JSON.parse(await readZipText(entries, "manifest.json")) as SerializedScene;
}

export async function importScenePackage(file: Blob) {
  const entries = await readZip(file);
  const manifest = JSON.parse(await readZipText(entries, "manifest.json")) as SerializedScene;
  const assets = new Map<string, Blob>();

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

  return Scene.fromJSON(manifest, assets);
}
