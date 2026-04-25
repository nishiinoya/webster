import { ImageLayer } from "../../layers/ImageLayer";
import { Scene } from "../../scene/Scene";
import {
  clampImagePixels,
  getImageLayerName,
  getSerializableImageMimeType,
  loadImageElement,
  loadImageElementFromBlob
} from "./imageFileUtils";
import { canvasToBlob } from "../export/exportFileUtils";

/**
 * Creates a new scene sized to an image file and inserts that image as the first layer.
 */
export async function createImageDocumentFromFile(file: File) {
  const image = await loadImageElement(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scene = new Scene({
    createDefaultLayer: false,
    documentHeight: height,
    documentWidth: width
  });

  scene.addLayer(
    new ImageLayer({
      assetId: crypto.randomUUID(),
      id: crypto.randomUUID(),
      image,
      mimeType: file.type || "image/png",
      name: getImageLayerName(file),
      objectUrl: image.src,
      x: scene.document.x,
      y: scene.document.y,
      width,
      height
    })
  );

  return scene;
}

/**
 * Imports an image file into the current scene with a reasonable initial on-canvas scale.
 */
export async function addImageFileToScene(scene: Scene, file: File) {
  const image = await loadImageElement(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const maxInitialSize = 420;
  const scale = Math.min(1, maxInitialSize / Math.max(width, height));

  const layer = new ImageLayer({
    assetId: crypto.randomUUID(),
    id: crypto.randomUUID(),
    name: getImageLayerName(file),
    image,
    mimeType: file.type || "image/png",
    objectUrl: image.src,
    x: (-width * scale) / 2,
    y: (-height * scale) / 2,
    width,
    height,
    scaleX: scale,
    scaleY: scale
  });

  scene.addLayer(layer);

  return layer;
}

/**
 * Re-rasterizes an image layer to a new pixel size while preserving its visible bounds.
 */
export async function resampleImageLayerInScene(
  scene: Scene,
  layerId: string,
  width: number,
  height: number
) {
  const layer = scene.getLayer(layerId);

  if (!(layer instanceof ImageLayer) || layer.locked) {
    return null;
  }

  const currentPixelWidth = layer.image.naturalWidth || layer.image.width;
  const currentPixelHeight = layer.image.naturalHeight || layer.image.height;
  const nextPixelWidth = clampImagePixels(width);
  const nextPixelHeight = clampImagePixels(height);

  if (nextPixelWidth === currentPixelWidth && nextPixelHeight === currentPixelHeight) {
    return layer;
  }

  const visibleWidth = layer.width * layer.scaleX;
  const visibleHeight = layer.height * layer.scaleY;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to resample image layer.");
  }

  canvas.width = nextPixelWidth;
  canvas.height = nextPixelHeight;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality =
    nextPixelWidth * nextPixelHeight >= currentPixelWidth * currentPixelHeight ? "high" : "medium";
  context.drawImage(layer.image, 0, 0, nextPixelWidth, nextPixelHeight);

  const blob = await canvasToBlob(canvas, getSerializableImageMimeType(layer.mimeType), 0.92);
  const image = await loadImageElementFromBlob(blob);

  layer.replaceImage(image, image.src, {
    assetId: crypto.randomUUID(),
    mimeType: blob.type || getSerializableImageMimeType(layer.mimeType)
  });
  layer.width = nextPixelWidth;
  layer.height = nextPixelHeight;
  layer.scaleX = visibleWidth / nextPixelWidth;
  layer.scaleY = visibleHeight / nextPixelHeight;

  return layer;
}

/**
 * Restores an image layer back to its original source pixels and scale.
 */
export function restoreOriginalImageLayerInScene(scene: Scene, layerId: string) {
  const layer = scene.getLayer(layerId);

  if (!(layer instanceof ImageLayer) || layer.locked) {
    return null;
  }

  const originalPixelWidth = layer.originalImage.naturalWidth || layer.originalImage.width;
  const originalPixelHeight = layer.originalImage.naturalHeight || layer.originalImage.height;

  layer.restoreOriginalImage();
  layer.width = originalPixelWidth;
  layer.height = originalPixelHeight;
  layer.scaleX = 1;
  layer.scaleY = 1;

  return layer;
}
