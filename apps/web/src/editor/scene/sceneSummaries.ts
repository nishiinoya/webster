import {
  cloneImageLayerGeometry,
  ImageLayer,
  isDefaultImageLayerGeometry
} from "../layers/ImageLayer";
import { Layer } from "../layers/Layer";
import { GroupLayer } from "../layers/GroupLayer";
import { Object3DLayer } from "../layers/Object3DLayer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { StrokeLayer } from "../layers/StrokeLayer";
import { TextLayer } from "../layers/TextLayer";

/**
 * Builds the UI-facing summary object used by layer panels and properties views.
 */
export function getLayerSummary(
  layer: Layer,
  selectedLayerId: string | null,
  options: { childCount?: number; depth?: number; selectedLayerIds?: string[] } = {}
) {
  const selectedLayerIds = options.selectedLayerIds ?? (selectedLayerId ? [selectedLayerId] : []);
  const baseSummary = {
    childCount: options.childCount ?? 0,
    collapsed: false,
    depth: options.depth ?? 0,
    groupId: layer.groupId,
    hasMask: Boolean(layer.mask),
    id: layer.id,
    isPrimarySelected: layer.id === selectedLayerId,
    isSelected: selectedLayerIds.includes(layer.id),
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
      customPath: layer.customPath.map((point) => ({ ...point })),
      fillColor: layer.fillColor,
      shape: layer.shape,
      strokeColor: layer.strokeColor,
      strokeWidth: layer.strokeWidth,
      texture: layer.texture,
      textureImage: layer.textureImage
        ? {
            height: layer.textureImage.height,
            name: layer.textureImage.name,
            width: layer.textureImage.width
          }
        : null
    };
  }

  if (layer instanceof Object3DLayer) {
    return {
      ...baseSummary,
      ambient: layer.ambient,
      lightIntensity: layer.lightIntensity,
      lightX: layer.lightX,
      lightY: layer.lightY,
      lightZ: layer.lightZ,
      materialColor: layer.materialColor,
      materialTexture: layer.materialTexture,
      materialTextureImage: layer.materialTextureImage
        ? {
            height: layer.materialTextureImage.height,
            name: layer.materialTextureImage.name,
            width: layer.materialTextureImage.width
          }
        : null,
      modelFormat: layer.importedModel?.sourceFormat ?? (layer.modelSource ? "obj" : null),
      modelName: layer.modelName,
      modelStats: layer.importedModel?.stats ?? null,
      modelSummary: layer.importedModel?.summary ?? null,
      modelWarnings: layer.importedModel?.warnings ?? [],
      objectKind: layer.objectKind,
      objectZoom: layer.objectZoom,
      rotationX: layer.rotationX,
      rotationY: layer.rotationY,
      rotationZ: layer.rotationZ,
      shadowOpacity: layer.shadowOpacity,
      shadowSoftness: layer.shadowSoftness
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

  if (layer instanceof GroupLayer) {
    return {
      ...baseSummary,
      collapsed: layer.collapsed
    };
  }

  if (layer instanceof ImageLayer) {
    return {
      ...baseSummary,
      canRestoreOriginalPixels: layer.hasWorkingImageChanges,
      hasCustomImageGeometry: !isDefaultImageLayerGeometry(layer.geometry),
      imageGeometry: cloneImageLayerGeometry(layer.geometry),
      imagePixelHeight: layer.image.naturalHeight || layer.image.height,
      imagePixelWidth: layer.image.naturalWidth || layer.image.width,
      originalImagePixelHeight: layer.originalImage.naturalHeight || layer.originalImage.height,
      originalImagePixelWidth: layer.originalImage.naturalWidth || layer.originalImage.width
    };
  }

  return baseSummary;
}
