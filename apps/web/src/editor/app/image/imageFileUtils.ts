/**
 * Derives the default layer name from an imported file name.
 */
export function getImageLayerName(file: File) {
  return file.name.replace(/\.[^.]+$/u, "") || "Image";
}

/**
 * Clamps requested image dimensions into the supported pixel range.
 */
export function clampImagePixels(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(Math.round(value), 1), 12000);
}

/**
 * Chooses an export-safe mime type for image layer serialization.
 */
export function getSerializableImageMimeType(mimeType: string) {
  return mimeType === "image/jpeg" || mimeType === "image/webp" ? mimeType : "image/png";
}

/**
 * Loads a `File` into a decoded `HTMLImageElement`.
 */
export async function loadImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;

  try {
    await image.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Unable to load image: ${file.name}`));
    });
  }

  return image;
}

/**
 * Loads a blob into an image element by wrapping it as a temporary file.
 */
export async function loadImageElementFromBlob(blob: Blob) {
  const file = new File([blob], "resampled-image", { type: blob.type || "image/png" });

  return loadImageElement(file);
}
