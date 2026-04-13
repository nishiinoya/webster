import { ImageLayer } from "../layers/ImageLayer";
import { Scene, SerializedScene } from "./Scene";
import { blobEntry, createZip, readZip, readZipText, textEntry } from "./ZipStore";

export async function exportScenePackage(scene: Scene) {
  const manifest = await scene.toJSON();
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
    }
  }

  return createZip(entries);
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
    }
  }

  return Scene.fromJSON(manifest, assets);
}
