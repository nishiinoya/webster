import { normalizeLayerFilters, normalizeLayerTexture } from "../layers/Layer";
import type {
  ImageLayerGeometry,
  LayerFilterSettings,
  LayerTextureSettings,
  Object3DKind
} from "../layers/Layer";
import { GroupLayer } from "../layers/GroupLayer";
import { ImageLayer, normalizeImageLayerGeometry } from "../layers/ImageLayer";
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
  rotation: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  shape: ShapeKind;
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
