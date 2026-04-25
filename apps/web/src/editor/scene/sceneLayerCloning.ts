import { AdjustmentLayer } from "../layers/AdjustmentLayer";
import { ImageLayer } from "../layers/ImageLayer";
import { Layer } from "../layers/Layer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { StrokeLayer } from "../layers/StrokeLayer";
import { TextLayer } from "../layers/TextLayer";

/**
 * Releases layer-owned resources when the layer provides a custom disposer.
 */
export function disposeLayer(layer: Layer) {
  if ("dispose" in layer && typeof layer.dispose === "function") {
    layer.dispose();
  }
}

/**
 * Creates a detached duplicate of a layer with a new id and a small positional offset.
 */
export function cloneLayer(layer: Layer) {
  const options = {
    height: layer.height,
    id: crypto.randomUUID(),
    locked: false,
    mask: layer.mask?.clone() ?? null,
    name: `${layer.name} copy`,
    opacity: layer.opacity,
    filters: layer.filters,
    rotation: layer.rotation,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    visible: layer.visible,
    width: layer.width,
    x: layer.x + 24,
    y: layer.y - 24
  };

  if (layer instanceof ShapeLayer) {
    return new ShapeLayer({
      ...options,
      fillColor: [...layer.fillColor],
      shape: layer.shape,
      strokeColor: [...layer.strokeColor],
      strokeWidth: layer.strokeWidth
    });
  }

  if (layer instanceof ImageLayer) {
    return new ImageLayer({
      ...options,
      assetId: layer.assetId,
      image: layer.image,
      mimeType: layer.mimeType,
      objectUrl: "",
      originalAssetId: layer.originalAssetId,
      originalImage: layer.originalImage,
      originalMimeType: layer.originalMimeType,
      originalObjectUrl: ""
    });
  }

  if (layer instanceof TextLayer) {
    return new TextLayer({
      ...options,
      align: layer.align,
      bold: layer.bold,
      color: [...layer.color],
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      italic: layer.italic,
      text: layer.text
    });
  }

  if (layer instanceof AdjustmentLayer) {
    return new AdjustmentLayer(options);
  }

  if (layer instanceof StrokeLayer) {
    return new StrokeLayer({
      ...options,
      color: [...layer.color],
      paths: layer.paths.map((path) => ({
        ...path,
        color: [...path.color],
        points: path.points.map((point) => ({ ...point }))
      })),
      strokeStyle: layer.strokeStyle,
      strokeWidth: layer.strokeWidth
    });
  }

  throw new Error(`Unsupported layer type: ${layer.type}`);
}
