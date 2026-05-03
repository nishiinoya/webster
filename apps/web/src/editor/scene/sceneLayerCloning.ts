import { AdjustmentLayer } from "../layers/AdjustmentLayer";
import { GroupLayer } from "../layers/GroupLayer";
import { cloneImageLayerGeometry, ImageLayer } from "../layers/ImageLayer";
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
export function cloneLayer(
  layer: Layer,
  optionsOverride: {
    groupId?: string | null;
    id?: string;
    locked?: boolean;
    name?: string;
    xOffset?: number;
    yOffset?: number;
  } = {}
) {
  const options = {
    groupId: optionsOverride.groupId ?? layer.groupId,
    height: layer.height,
    id: optionsOverride.id ?? crypto.randomUUID(),
    locked: optionsOverride.locked ?? false,
    mask: layer.mask?.clone() ?? null,
    name: optionsOverride.name ?? `${layer.name} copy`,
    opacity: layer.opacity,
    filters: layer.filters,
    rotation: layer.rotation,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    visible: layer.visible,
    width: layer.width,
    x: layer.x + (optionsOverride.xOffset ?? 24),
    y: layer.y + (optionsOverride.yOffset ?? -24)
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
      geometry: cloneImageLayerGeometry(layer.geometry),
      image: layer.image,
      mimeType: layer.mimeType,
      objectUrl: "",
      originalAssetId: layer.originalAssetId,
      originalImage: layer.originalImage,
      originalMimeType: layer.originalMimeType,
      originalObjectUrl: ""
    });
  }

  if (layer instanceof GroupLayer) {
    return new GroupLayer({
      ...options,
      collapsed: layer.collapsed
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
        points: path.points.map((point) => ({ ...point })),
        selectionClip: path.selectionClip
          ? {
              ...path.selectionClip,
              bounds: { ...path.selectionClip.bounds },
              mask: path.selectionClip.mask
                ? {
                    data: new Uint8Array(path.selectionClip.mask.data),
                    height: path.selectionClip.mask.height,
                    width: path.selectionClip.mask.width
                  }
                : undefined,
              points: path.selectionClip.points?.map((point) => ({ ...point }))
            }
          : path.selectionClip
      })),
      strokeStyle: layer.strokeStyle,
      strokeWidth: layer.strokeWidth
    });
  }

  throw new Error(`Unsupported layer type: ${layer.type}`);
}
