import type { SerializedLayer } from "../layers/Layer";
import { Layer } from "../layers/Layer";

export type SerializedSceneData = {
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

/**
 * Hydrates a scene snapshot into plain document data, layer instances, and a valid selection id.
 */
export async function loadSceneFromJSON(
  data: SerializedSceneData,
  assets = new Map<string, Blob>()
) {
  if (!data || data.version !== 1 || !Array.isArray(data.layers)) {
    throw new Error("Unsupported scene JSON.");
  }

  const layers = await Promise.all(data.layers.map((layerData) => Layer.fromJSON(layerData, assets)));

  return {
    document: {
      x: data.canvas.x ?? -data.canvas.width / 2,
      y: data.canvas.y ?? -data.canvas.height / 2,
      width: data.canvas.width,
      height: data.canvas.height,
      color: data.canvas.background
    },
    layers,
    selectedLayerId:
      data.selectedLayerId === undefined
        ? layers.at(-1)?.id ?? null
        : data.selectedLayerId
          ? (layers.find((layer) => layer.id === data.selectedLayerId)?.id ?? layers.at(-1)?.id ?? null)
          : null
  };
}

/**
 * Serializes the current scene state into the persisted `.webster` scene shape.
 */
export async function serializeSceneToJSON(input: {
  document: {
    color: [number, number, number, number];
    height: number;
    width: number;
    x: number;
    y: number;
  };
  layers: Layer[];
  selectedLayerId: string | null;
}): Promise<SerializedSceneData> {
  return {
    app: "webster",
    canvas: {
      background: input.document.color,
      height: input.document.height,
      width: input.document.width,
      x: input.document.x,
      y: input.document.y
    },
    layers: await Promise.all(input.layers.map((layer) => layer.toJSON())),
    selectedLayerId: input.selectedLayerId,
    version: 1
  };
}
