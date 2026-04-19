import { ImageLayer } from "../layers/ImageLayer";
import { Layer } from "../layers/Layer";
import type { SerializedLayer } from "../layers/Layer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { TextLayer } from "../layers/TextLayer"
import { SelectionManager } from "../selection/SelectionManager";
import { ensureLayerMaskResolution } from "../masks/LayerMaskResolution";

export type DocumentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: [number, number, number, number];
};

export type SerializedScene = {
  app: "webster";
  canvas: {
    background: [number, number, number, number];
    height: number;
    width: number;
    x?: number;
    y?: number;
  };
  layers: SerializedLayer[];
  selectedLayerId?: string | null;
  version: 1;
};

export class Scene {
  readonly document: DocumentBounds;
  readonly selection = new SelectionManager();

  readonly layers: Layer[] = [];
  selectedLayerId: string | null = null;

  constructor(
    options: {
      createDefaultLayer?: boolean;
      documentHeight?: number;
      documentWidth?: number;
    } = {}
  ) {
    const documentWidth = options.documentWidth ?? 800;
    const documentHeight = options.documentHeight ?? 600;

    this.document = {
      x: -documentWidth / 2,
      y: -documentHeight / 2,
      width: documentWidth,
      height: documentHeight,
      color: [0.96, 0.97, 0.94, 1]
    };

    if (options.createDefaultLayer ?? true) {
      this.addLayer(
        new ShapeLayer({
          id: "default-shape",
          name: "Rectangle",
          x: -110,
          y: -60,
          width: 260,
          height: 160,
          shape: "rectangle",
          fillColor: [0.18, 0.49, 0.44, 1],
          strokeColor: [0.07, 0.08, 0.09, 1],
          strokeWidth: 0
        })
      );
    }
  }

  static async fromJSON(data: SerializedScene, assets = new Map<string, Blob>()) {
    if (!data || data.version !== 1 || !Array.isArray(data.layers)) {
      throw new Error("Unsupported scene JSON.");
    }

    const scene = new Scene({ createDefaultLayer: false });

    scene.document.x = data.canvas.x ?? -data.canvas.width / 2;
    scene.document.y = data.canvas.y ?? -data.canvas.height / 2;
    scene.document.width = data.canvas.width;
    scene.document.height = data.canvas.height;
    scene.document.color = data.canvas.background;

    for (const layerData of data.layers) {
      scene.layers.push(await Layer.fromJSON(layerData, assets));
    }

    scene.selectedLayerId =
      data.selectedLayerId === undefined
        ? scene.layers.at(-1)?.id ?? null
        : data.selectedLayerId
          ? scene.getLayer(data.selectedLayerId)?.id ?? scene.layers.at(-1)?.id ?? null
          : null;

    return scene;
  }

  addLayer(layer: Layer) {
    this.layers.push(layer);
    this.selectedLayerId = layer.id;

    return layer;
  }

  removeLayer(layerId: string) {
    const layerIndex = this.layers.findIndex((layer) => layer.id === layerId);

    if (layerIndex < 0) {
      return null;
    }

    const [removedLayer] = this.layers.splice(layerIndex, 1);

    disposeLayer(removedLayer);

    if (this.selectedLayerId === layerId) {
      this.selectedLayerId = this.layers.at(-1)?.id ?? null;
    }

    return removedLayer;
  }

  getLayer(layerId: string) {
    return this.layers.find((layer) => layer.id === layerId) ?? null;
  }

  selectLayer(layerId: string | null) {
    if (layerId === null) {
      this.selectedLayerId = null;
      return null;
    }

    const layer = this.getLayer(layerId);

    if (!layer) {
      return null;
    }

    this.selectedLayerId = layer.id;

    return layer;
  }

  hitTestLayer(x: number, y: number) {
    for (let index = this.layers.length - 1; index >= 0; index -= 1) {
      const layer = this.layers[index];

      if (!layer.visible || layer.opacity <= 0) {
        continue;
      }

      if (isPointInsideLayer(layer, x, y)) {
        return layer;
      }
    }

    return null;
  }

  moveLayer(layerId: string, x: number, y: number) {
    const layer = this.getLayer(layerId);

    if (!layer || layer.locked) {
      return null;
    }

    layer.x = x;
    layer.y = y;

    return layer;
  }

  updateLayer(
    layerId: string,
    updates: Partial<{
      align: "left" | "center" | "right";
      bold: boolean;
      color: [number, number, number, number];
      fillColor: [number, number, number, number];
      fontFamily: string;
      fontSize: number;
      height: number;
      italic: boolean;
      locked: boolean;
      name: string;
      opacity: number;
      rotation: number;
      shape: "rectangle" | "circle" | "line";
      strokeColor: [number, number, number, number];
      strokeWidth: number;
      text: string;
      visible: boolean;
      width: number;
      x: number;
      y: number;
  }>
  ) {
    const layer = this.getLayer(layerId);

    if (!layer) {
      return null;
    }

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

    if (!layer.locked) {
      if (updates.x !== undefined) {
        layer.x = updates.x;
      }

      if (updates.y !== undefined) {
        layer.y = updates.y;
      }

      if (updates.rotation !== undefined) {
        layer.rotation = normalizeRotation(updates.rotation);
      }

      if (updates.width !== undefined && !(layer instanceof TextLayer)) {
        layer.scaleX = Math.max(1, updates.width) / layer.width;
      }

      if (updates.height !== undefined && !(layer instanceof TextLayer)) {
        layer.scaleY = Math.max(1, updates.height) / layer.height;
      }
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

  updateLayerMask(layerId: string, action: LayerMaskAction) {
    const layer = this.getLayer(layerId);

    if (!layer || layer.locked) {
      return null;
    }

    return applyLayerMaskAction(layer, action);
  }

  duplicateLayer(layerId: string) {
    const layer = this.getLayer(layerId);

    if (!layer) {
      return null;
    }

    const copy = cloneLayer(layer);
    const layerIndex = this.layers.findIndex((candidate) => candidate.id === layerId);

    this.layers.splice(layerIndex + 1, 0, copy);
    this.selectedLayerId = copy.id;

    return copy;
  }

  reorderLayer(layerId: string, targetIndex: number) {
    const currentIndex = this.layers.findIndex((layer) => layer.id === layerId);

    if (currentIndex < 0) {
      return null;
    }

    const nextIndex = Math.min(Math.max(targetIndex, 0), this.layers.length - 1);
    const [layer] = this.layers.splice(currentIndex, 1);
    this.layers.splice(nextIndex, 0, layer);

    return layer;
  }

  moveLayerForward(layerId: string) {
    const currentIndex = this.layers.findIndex((layer) => layer.id === layerId);

    if (currentIndex < 0) {
      return null;
    }

    return this.reorderLayer(layerId, currentIndex + 1);
  }

  moveLayerBackward(layerId: string) {
    const currentIndex = this.layers.findIndex((layer) => layer.id === layerId);

    if (currentIndex < 0) {
      return null;
    }

    return this.reorderLayer(layerId, currentIndex - 1);
  }

  moveLayerToFront(layerId: string) {
    return this.reorderLayer(layerId, this.layers.length - 1);
  }

  moveLayerToBack(layerId: string) {
    return this.reorderLayer(layerId, 0);
  }

  getLayerSummaries() {
    return this.layers.map((layer) => getLayerSummary(layer, this.selectedLayerId)).reverse();
  }

  async toJSON(): Promise<SerializedScene> {
    return {
      app: "webster",
      canvas: {
        background: this.document.color,
        height: this.document.height,
        width: this.document.width,
        x: this.document.x,
        y: this.document.y
      },
      layers: await Promise.all(this.layers.map((layer) => layer.toJSON())),
      selectedLayerId: this.selectedLayerId,
      version: 1
    };
  }

  dispose() {
    for (const layer of this.layers) {
      disposeLayer(layer);
    }
  }
}

function disposeLayer(layer: Layer) {
  if ("dispose" in layer && typeof layer.dispose === "function") {
    layer.dispose();
  }
}

function cloneLayer(layer: Layer) {
  const options = {
    height: layer.height,
    id: crypto.randomUUID(),
    locked: false,
    mask: layer.mask?.clone() ?? null,
    name: `${layer.name} copy`,
    opacity: layer.opacity,
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
      image: layer.image,
      objectUrl: ""
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


  throw new Error(`Unsupported layer type: ${layer.type}`);
}

export type LayerMaskAction =
  | "add"
  | "clear-black"
  | "clear-white"
  | "delete"
  | "disable"
  | "enable"
  | "invert"
  | "toggle-enabled";

function applyLayerMaskAction(layer: Layer, action: LayerMaskAction) {
  if (action === "delete") {
    layer.mask = null;
    return layer;
  }

  if (action === "add" && !layer.mask) {
    ensureLayerMaskResolution(layer);
    return layer;
  }

  if (!layer.mask) {
    return layer;
  }

  if (action === "enable") {
    layer.mask.enabled = true;
  }

  if (action === "disable") {
    layer.mask.enabled = false;
  }

  if (action === "toggle-enabled") {
    layer.mask.enabled = !layer.mask.enabled;
  }

  if (action === "invert") {
    layer.mask.invert();
  }

  if (action === "clear-white") {
    layer.mask.clear(255);
  }

  if (action === "clear-black") {
    layer.mask.clear(0);
  }

  return layer;
}

function isPointInsideLayer(layer: Layer, x: number, y: number) {
  const width = layer.width * layer.scaleX;
  const height = layer.height * layer.scaleY;

  const centerX = layer.x + width / 2;
  const centerY = layer.y + height / 2;

  const radians = (-layer.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const dx = x - centerX;
  const dy = y - centerY;

  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  return (
    localX >= -width / 2 &&
    localX <= width / 2 &&
    localY >= -height / 2 &&
    localY <= height / 2
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

function getLayerSummary(layer: Layer, selectedLayerId: string | null) {
  const baseSummary = {
    hasMask: Boolean(layer.mask),
    id: layer.id,
    isSelected: layer.id === selectedLayerId,
    isVisible: layer.visible,
    locked: layer.locked,
    maskEnabled: layer.mask?.enabled ?? false,
    name: layer.name,
    opacity: layer.opacity,
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

  return baseSummary;
}
