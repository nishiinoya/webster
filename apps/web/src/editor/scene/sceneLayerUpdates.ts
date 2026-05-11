import { normalizeLayerFilters, normalizeLayerTexture } from "../layers/Layer";
import type {
  ImageLayerGeometry,
  LayerContentCrop,
  LayerFilterSettings,
  LayerTextureSettings,
  Object3DKind
} from "../layers/Layer";
import { GroupLayer } from "../layers/GroupLayer";
import {
  createDefaultImageLayerGeometry,
  ImageLayer,
  normalizeImageLayerGeometry
} from "../layers/ImageLayer";
import { Layer } from "../layers/Layer";
import { Object3DLayer, normalizeObject3DKind, normalizeRotation as normalize3DRotation } from "../layers/Object3DLayer";
import { ShapeLayer } from "../layers/ShapeLayer";
import type { ShapeKind } from "../layers/ShapeLayer";
import { StrokeLayer } from "../layers/StrokeLayer";
import { TextLayer } from "../layers/TextLayer";
import { clamp, normalizeRotation } from "./sceneResize";

export type SceneLayerUpdates = Partial<{
  align: "left" | "center" | "right";
  bold: boolean;
  color: [number, number, number, number];
  collapsed: boolean;
  fillColor: [number, number, number, number];
  filters: Partial<LayerFilterSettings>;
  fontFamily: string;
  fontSize: number;
  height: number;
  imageGeometry: Partial<ImageLayerGeometry> | null;
  italic: boolean;
  locked: boolean;
  ambient: number;
  lightIntensity: number;
  lightX: number;
  lightY: number;
  lightZ: number;
  materialColor: [number, number, number, number];
  materialTexture: Partial<LayerTextureSettings>;
  name: string;
  objectKind: Object3DKind;
  objectZoom: number;
  opacity: number;
  resetCrop: boolean;
  rotation: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  shape: ShapeKind;
  shadowDistance: number;
  shadowOpacity: number;
  shadowSoftness: number;
  strokeColor: [number, number, number, number];
  strokeWidth: number;
  text: string;
  texture: Partial<LayerTextureSettings>;
  visible: boolean;
  width: number;
  x: number;
  y: number;
}>;

/**
 * Applies partial property updates to a layer, respecting each layer type's edit rules.
 */
export function applySceneLayerUpdates(layer: Layer, updates: SceneLayerUpdates) {
  if (updates.name !== undefined) {
    layer.name = updates.name;
  }

  if (updates.visible !== undefined) {
    layer.visible = updates.visible;
  }

  if (updates.locked !== undefined) {
    layer.locked = updates.locked;
  }

  if (updates.opacity !== undefined) {
    layer.opacity = clamp(updates.opacity, 0, 1);
  }

  if (updates.filters !== undefined) {
    layer.filters = normalizeLayerFilters({
      ...layer.filters,
      ...updates.filters
    });
  }

  if (!layer.locked) {
    if (updates.resetCrop) {
      resetLayerCrop(layer);
    }

    if (updates.x !== undefined) {
      layer.x = updates.x;
    }

    if (updates.y !== undefined) {
      layer.y = updates.y;
    }

    if (updates.rotation !== undefined && !(layer instanceof GroupLayer)) {
      layer.rotation = normalizeRotation(updates.rotation);
    }

    if (
      updates.width !== undefined &&
      !(layer instanceof TextLayer) &&
      !(layer instanceof GroupLayer)
    ) {
      layer.scaleX = Math.max(1, updates.width) / layer.width;
    }

    if (
      updates.height !== undefined &&
      !(layer instanceof TextLayer) &&
      !(layer instanceof GroupLayer)
    ) {
      layer.scaleY = Math.max(1, updates.height) / layer.height;
    }
  }

  if (layer instanceof GroupLayer) {
    if (updates.collapsed !== undefined) {
      layer.collapsed = updates.collapsed;
    }

    return layer;
  }

  if (layer instanceof ShapeLayer && !layer.locked) {
    if (updates.shape !== undefined) {
      layer.shape = updates.shape;
    }

    if (updates.fillColor !== undefined) {
      layer.fillColor = updates.fillColor;
    }

    if (updates.strokeColor !== undefined) {
      layer.strokeColor = updates.strokeColor;
    }

    if (updates.strokeWidth !== undefined) {
      layer.strokeWidth = Math.max(0, updates.strokeWidth);
    }

    if (updates.texture !== undefined) {
      layer.texture = normalizeLayerTexture({
        ...layer.texture,
        ...updates.texture
      });
    }
  }

  if (layer instanceof Object3DLayer && !layer.locked) {
    if (updates.objectKind !== undefined) {
      const objectKind = normalizeObject3DKind(updates.objectKind);

      layer.objectKind = objectKind === "imported" && !layer.modelSource ? layer.objectKind : objectKind;
    }

    if (updates.materialColor !== undefined) {
      layer.materialColor = normalizeColor(updates.materialColor);
    }

    if (updates.materialTexture !== undefined) {
      layer.materialTexture = normalizeLayerTexture({
        ...layer.materialTexture,
        ...updates.materialTexture
      });
    }

    if (updates.objectZoom !== undefined) {
      layer.objectZoom = clamp(updates.objectZoom, 0.2, 4);
    }

    if (updates.rotationX !== undefined) {
      layer.rotationX = normalize3DRotation(updates.rotationX);
    }

    if (updates.rotationY !== undefined) {
      layer.rotationY = normalize3DRotation(updates.rotationY);
    }

    if (updates.rotationZ !== undefined) {
      layer.rotationZ = normalize3DRotation(updates.rotationZ);
    }

    if (updates.lightX !== undefined) {
      layer.lightX = clamp(updates.lightX, -6, 6);
    }

    if (updates.lightY !== undefined) {
      layer.lightY = clamp(updates.lightY, -6, 6);
    }

    if (updates.lightZ !== undefined) {
      layer.lightZ = clamp(updates.lightZ, 0.5, 10);
    }

    if (updates.lightIntensity !== undefined) {
      layer.lightIntensity = clamp(updates.lightIntensity, 0, 2);
    }

    if (updates.ambient !== undefined) {
      layer.ambient = clamp(updates.ambient, 0, 1);
    }

    if (updates.shadowOpacity !== undefined) {
      layer.shadowOpacity = clamp(updates.shadowOpacity, 0, 1);
    }

    if (updates.shadowDistance !== undefined) {
      layer.shadowDistance = clamp(updates.shadowDistance, 0, 1.5);
    }

    if (updates.shadowSoftness !== undefined) {
      layer.shadowSoftness = clamp(updates.shadowSoftness, 0, 64);
    }
  }

  if (layer instanceof ImageLayer && !layer.locked && updates.imageGeometry !== undefined) {
    layer.geometry = normalizeImageLayerGeometry(updates.imageGeometry);
  }

  if (layer instanceof StrokeLayer && !layer.locked) {
    if (updates.color !== undefined) {
      layer.color = updates.color;
    }

    if (updates.strokeWidth !== undefined) {
      layer.strokeWidth = Math.max(1, updates.strokeWidth);
    }
  }

  if (layer instanceof TextLayer && !layer.locked) {
    if (updates.text !== undefined) {
      layer.text = updates.text;
    }

    if (updates.fontSize !== undefined) {
      layer.fontSize = Math.max(1, updates.fontSize);
    }

    if (updates.fontFamily !== undefined) {
      layer.fontFamily = updates.fontFamily;
    }

    if (updates.color !== undefined) {
      layer.color = updates.color;
    }

    if (updates.bold !== undefined) {
      layer.bold = updates.bold;
    }

    if (updates.italic !== undefined) {
      layer.italic = updates.italic;
    }

    if (updates.align !== undefined) {
      layer.align = updates.align;
    }

    if (updates.width !== undefined) {
      layer.width = Math.max(1, updates.width);
      layer.scaleX = 1;
    }

    if (updates.height !== undefined) {
      layer.height = Math.max(1, updates.height);
      layer.scaleY = 1;
    }
  }

  return layer;
}

function normalizeColor(color: [number, number, number, number]): [number, number, number, number] {
  return [
    clamp(color[0], 0, 1),
    clamp(color[1], 0, 1),
    clamp(color[2], 0, 1),
    clamp(color[3], 0, 1)
  ];
}

function resetLayerCrop(layer: Layer) {
  if (layer.crop) {
    restoreLayerBoundsFromCrop(layer, layer.crop);
    layer.crop = null;

    if (!(layer instanceof ImageLayer)) {
      layer.mask = null;
    }
  }

  if (layer instanceof ImageLayer) {
    const defaultGeometry = createDefaultImageLayerGeometry();
    const crop = layer.geometry.crop;

    if (!areImageCropsEqual(crop, defaultGeometry.crop)) {
      restoreLayerBoundsFromCrop(layer, {
        bottom: crop.bottom * layer.height,
        left: crop.left * layer.width,
        right: crop.right * layer.width,
        top: crop.top * layer.height
      });
      layer.geometry = {
        ...layer.geometry,
        crop: defaultGeometry.crop
      };
    }
  }
}

function restoreLayerBoundsFromCrop(layer: Layer, crop: LayerContentCrop) {
  const cropWidth = Math.max(1e-6, crop.right - crop.left);
  const cropHeight = Math.max(1e-6, crop.top - crop.bottom);
  const resetScaleX = layer.scaleX * (layer.width / cropWidth);
  const resetScaleY = layer.scaleY * (layer.height / cropHeight);
  const fullWidth = layer.width * resetScaleX;
  const fullHeight = layer.height * resetScaleY;
  const currentWidth = layer.width * layer.scaleX;
  const currentHeight = layer.height * layer.scaleY;
  const currentCenter = {
    x: layer.x + currentWidth / 2,
    y: layer.y + currentHeight / 2
  };
  const cropBottomLeftWorld = rotatePoint(
    { x: layer.x, y: layer.y },
    currentCenter,
    layer.rotation
  );
  const cropOffsetFromFullCenter = rotateVector(
    {
      x: crop.left * resetScaleX - fullWidth / 2,
      y: crop.bottom * resetScaleY - fullHeight / 2
    },
    layer.rotation
  );
  const fullCenter = {
    x: cropBottomLeftWorld.x - cropOffsetFromFullCenter.x,
    y: cropBottomLeftWorld.y - cropOffsetFromFullCenter.y
  };

  layer.scaleX = resetScaleX;
  layer.scaleY = resetScaleY;
  layer.x = fullCenter.x - fullWidth / 2;
  layer.y = fullCenter.y - fullHeight / 2;
}

function rotatePoint(point: { x: number; y: number }, center: { x: number; y: number }, degrees: number) {
  const rotated = rotateVector(
    {
      x: point.x - center.x,
      y: point.y - center.y
    },
    degrees
  );

  return {
    x: center.x + rotated.x,
    y: center.y + rotated.y
  };
}

function rotateVector(vector: { x: number; y: number }, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos
  };
}

function areImageCropsEqual(
  left: ImageLayerGeometry["crop"],
  right: ImageLayerGeometry["crop"]
) {
  return (
    left.left === right.left &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.top === right.top
  );
}
