/** Layer mask sizing and resampling helpers. */
import { Layer } from "../layers/Layer";
import { TextLayer } from "../layers/TextLayer";
import { getTextMaskFrame } from "../rendering/text/BitmapText";
import { LayerMask } from "./LayerMask";

const MASK_RESOLUTION_SCALE = 2;
const MAX_MASK_EDGE = 4096;
const MAX_MASK_PIXELS = 12_000_000;

export function ensureLayerMaskResolution(layer: Layer) {
  const preferredSize = getPreferredLayerMaskSize(layer);

  if (!layer.mask) {
    layer.mask = new LayerMask(preferredSize);
    return layer.mask;
  }

  if (layer.mask.width === preferredSize.width && layer.mask.height === preferredSize.height) {
    return layer.mask;
  }

  layer.mask = resizeMask(
    layer.mask,
    preferredSize.width,
    preferredSize.height
  );

  return layer.mask;
}

export function getPreferredLayerMaskSize(layer: Layer) {
  const frame = layer instanceof TextLayer ? layer.lastTextMaskFrame ?? getTextMaskFrame(layer) : layer;

  const rawWidth = Math.max(1, Math.ceil(frame.width * MASK_RESOLUTION_SCALE));
  const rawHeight = Math.max(1, Math.ceil(frame.height * MASK_RESOLUTION_SCALE));
  const edgeScale = Math.min(1, MAX_MASK_EDGE / Math.max(rawWidth, rawHeight));
  const pixelScale = Math.min(1, Math.sqrt(MAX_MASK_PIXELS / Math.max(1, rawWidth * rawHeight)));
  const scale = Math.min(edgeScale, pixelScale);

  return {
    height: Math.max(1, Math.round(rawHeight * scale)),
    width: Math.max(1, Math.round(rawWidth * scale))
  };
}

function resizeMask(mask: LayerMask, width: number, height: number) {
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(mask.height - 1, Math.floor((y / height) * mask.height));

    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(mask.width - 1, Math.floor((x / width) * mask.width));

      data[y * width + x] = mask.data[sourceY * mask.width + sourceX];
    }
  }

  return new LayerMask({
    data,
    enabled: mask.enabled,
    height,
    id: mask.id,
    width
  });
}
