import { ImageLayer } from "../layers/ImageLayer";
import { Layer } from "../layers/Layer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { StrokeLayer } from "../layers/StrokeLayer";
import { TextLayer } from "../layers/TextLayer";

/**
 * Builds the UI-facing summary object used by layer panels and properties views.
 */
export function getLayerSummary(layer: Layer, selectedLayerId: string | null) {
  const baseSummary = {
    hasMask: Boolean(layer.mask),
    id: layer.id,
    isSelected: layer.id === selectedLayerId,
    isVisible: layer.visible,
    locked: layer.locked,
    maskEnabled: layer.mask?.enabled ?? false,
    name: layer.name,
    opacity: layer.opacity,
    filters: layer.filters,
    rotation: layer.rotation,
    type: layer.type,
    x: layer.x,
    y: layer.y,
    width: layer.width * layer.scaleX,
    height: layer.height * layer.scaleY
  };

  if (layer instanceof ShapeLayer) {
    return {
      ...baseSummary,
      fillColor: layer.fillColor,
      shape: layer.shape,
      strokeColor: layer.strokeColor,
      strokeWidth: layer.strokeWidth
    };
  }

  if (layer instanceof TextLayer) {
    return {
      ...baseSummary,
      align: layer.align,
      bold: layer.bold,
      color: layer.color,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      italic: layer.italic,
      text: layer.text
    };
  }

  if (layer instanceof StrokeLayer) {
    return {
      ...baseSummary,
      color: layer.color,
      strokeStyle: layer.strokeStyle,
      strokeWidth: layer.strokeWidth
    };
  }

  if (layer instanceof ImageLayer) {
    return {
      ...baseSummary,
      canRestoreOriginalPixels: layer.hasWorkingImageChanges,
      imagePixelHeight: layer.image.naturalHeight || layer.image.height,
      imagePixelWidth: layer.image.naturalWidth || layer.image.width,
      originalImagePixelHeight: layer.originalImage.naturalHeight || layer.originalImage.height,
      originalImagePixelWidth: layer.originalImage.naturalWidth || layer.originalImage.width
    };
  }

  return baseSummary;
}
