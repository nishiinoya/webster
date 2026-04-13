import { ImageLayer } from "../layers/ImageLayer";
import { Layer } from "../layers/Layer";
import type { SerializedLayer } from "../layers/Layer";
import { ShapeLayer } from "../layers/ShapeLayer";

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

  readonly layers: Layer[] = [];
  selectedLayerId: string | null = null;

  constructor(options: { createDefaultLayer?: boolean } = {}) {
    this.document = {
      x: -400,
      y: -300,
      width: 800,
      height: 600,
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
          color: [0.18, 0.49, 0.44, 1]
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
      height: number;
      locked: boolean;
      name: string;
      opacity: number;
      rotation: number;
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

      if (updates.width !== undefined) {
        layer.scaleX = Math.max(1, updates.width) / layer.width;
      }

      if (updates.height !== undefined) {
        layer.scaleY = Math.max(1, updates.height) / layer.height;
      }
    }

    return layer;
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
    return this.layers
      .map((layer) => ({
        id: layer.id,
        isSelected: layer.id === this.selectedLayerId,
        isVisible: layer.visible,
        locked: layer.locked,
        name: layer.name,
        opacity: layer.opacity,
        rotation: layer.rotation,
        type: layer.type,
        x: layer.x,
        y: layer.y,
        width: layer.width * layer.scaleX,
        height: layer.height * layer.scaleY
      }))
      .reverse();
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
      color: [...layer.color]
    });
  }

  if (layer instanceof ImageLayer) {
    return new ImageLayer({
      ...options,
      image: layer.image,
      objectUrl: ""
    });
  }

  throw new Error(`Unsupported layer type: ${layer.type}`);
}

function isPointInsideLayer(layer: Layer, x: number, y: number) {
  const width = layer.width * layer.scaleX;
  const height = layer.height * layer.scaleY;
  const left = Math.min(layer.x, layer.x + width);
  const right = Math.max(layer.x, layer.x + width);
  const bottom = Math.min(layer.y, layer.y + height);
  const top = Math.max(layer.y, layer.y + height);

  return x >= left && x <= right && y >= bottom && y <= top;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}
