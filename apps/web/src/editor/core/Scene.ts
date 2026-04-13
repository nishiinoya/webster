import { Layer } from "../layers/Layer";
import { ShapeLayer } from "../layers/ShapeLayer";

export type DocumentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: [number, number, number, number];
};

export class Scene {
  readonly document: DocumentBounds = {
    x: -400,
    y: -300,
    width: 800,
    height: 600,
    color: [0.96, 0.97, 0.94, 1]
  };

  readonly layers: Layer[] = [];
  selectedLayerId: string | null = null;

  constructor() {
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

  dispose() {
    for (const layer of this.layers) {
      if ("dispose" in layer && typeof layer.dispose === "function") {
        layer.dispose();
      }
    }
  }
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
