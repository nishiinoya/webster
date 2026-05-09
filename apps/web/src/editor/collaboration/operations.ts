import type {
  ProjectOperation,
  ProjectOperationKind,
  ProjectOperationPhase,
  SharedProjectAssetReference,
  WebsterProjectManifest,
  WebsterSerializedLayer
} from "@webster/shared";
import type { EditorApp } from "../app/EditorApp";
import type { SharedEditorAction } from "../app/history/SharedEditorAction";
import type { SerializedScene } from "../scene/Scene";

type CreateOperationOptions = {
  action: SharedEditorAction;
  clientId: string;
  editorApp: EditorApp;
  phase: ProjectOperationPhase;
  projectId: string;
  projectVersion: number;
};

type CreatePreviewOperationOptions = {
  clientId: string;
  editorApp: EditorApp;
  projectId: string;
  projectVersion: number;
  tool: string;
};

export async function createOperationFromEditorAction({
  action,
  clientId,
  editorApp,
  phase,
  projectId,
  projectVersion
}: CreateOperationOptions): Promise<ProjectOperation> {
  const scene = await editorApp.getScene().toJSON();
  const manifest = scene as WebsterProjectManifest;

  return {
    assetReferences: collectAssetReferences(manifest),
    baseVersion: projectVersion,
    clientId,
    clientOperationId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: getOperationKind(action),
    label: action.label,
    payload: getOperationPayload(action),
    phase,
    projectId,
    scene: manifest
  };
}

export async function createPreviewOperationFromEditorScene({
  clientId,
  editorApp,
  projectId,
  projectVersion,
  tool
}: CreatePreviewOperationOptions): Promise<ProjectOperation> {
  const scene = await editorApp.getScene().toJSON();
  const manifest = scene as WebsterProjectManifest;

  return {
    assetReferences: collectAssetReferences(manifest),
    baseVersion: projectVersion,
    clientId,
    clientOperationId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: getPreviewOperationKind(tool),
    label: `${tool} preview`,
    payload: {
      source: "pointer-preview",
      tool
    },
    phase: "preview",
    projectId,
    scene: manifest
  };
}

/**
 * Applies a backend-broadcast operation to the local editor by hydrating the
 * `.webster` manifest shape the app already understands. Future granular
 * operations can be added here without leaking socket concerns into tools/UI.
 */
export async function applyOperationToScene(
  editorApp: EditorApp,
  operation: ProjectOperation,
  assets = new Map<string, Blob>()
) {
  if (!operation.scene) {
    return false;
  }

  await editorApp.importSerializedScene(operation.scene as unknown as SerializedScene, assets, {
    historyLabel: operation.phase === "preview" ? "Remote preview" : "Remote update"
  });

  return true;
}

function getOperationKind(action: SharedEditorAction): ProjectOperationKind {
  if (action.kind === "text") {
    return "text:edit";
  }

  if (action.kind === "gesture") {
    return getPreviewOperationKind(action.tool);
  }

  if (action.kind === "scene") {
    return getSceneOperationKind(action.operation);
  }

  if (action.kind === "command") {
    return getCommandOperationKind(action.scope, action.payload);
  }

  return "scene:replace";
}

function getPreviewOperationKind(tool: string): ProjectOperationKind {
  switch (tool) {
    case "Draw":
      return "stroke:commit";
    case "Mask Brush":
      return "mask:paint";
    case "Shape":
      return "shape:edit";
    case "Rectangle Select":
    case "Ellipse Select":
    case "Lasso Select":
    case "Magic Select":
      return "selection:update";
    case "Transform":
    case "Crop":
    case "Move":
      return "layer:transform";
    default:
      return "layer:update";
  }
}

function getSceneOperationKind(operation: string): ProjectOperationKind {
  if (operation.includes("image") || operation.includes("texture") || operation.includes("font")) {
    return "asset:create";
  }

  if (operation.includes("3d") || operation.includes("model")) {
    return "object3d:update";
  }

  if (operation.includes("text") || operation.includes("template")) {
    return "layer:create";
  }

  return "scene:replace";
}

function getCommandOperationKind(scope: string, payload: unknown): ProjectOperationKind {
  if (scope === "document") {
    return "document:update";
  }

  if (scope === "image-layer") {
    return "image-layer:update";
  }

  if (scope === "selection") {
    return "selection:update";
  }

  const type = readPayloadType(payload);

  switch (type) {
    case "add-adjustment":
    case "add-object3d":
    case "duplicate":
    case "group":
      return "layer:create";
    case "delete":
      return "layer:delete";
    case "move-down":
    case "move-to-position":
    case "move-up":
    case "remove-from-group":
      return "layer:reorder";
    case "mask":
      return "mask:paint";
    case "update":
      return getLayerUpdateOperationKind(payload);
    default:
      return "layer:update";
  }
}

function getLayerUpdateOperationKind(payload: unknown): ProjectOperationKind {
  if (!payload || typeof payload !== "object" || !("updates" in payload)) {
    return "layer:update";
  }

  const updates = (payload as { updates?: Record<string, unknown> }).updates ?? {};
  const keys = new Set(Object.keys(updates));

  if (keys.has("filters")) {
    return "filter:update";
  }

  if (
    keys.has("text") ||
    keys.has("fontFamily") ||
    keys.has("fontSize") ||
    keys.has("align") ||
    keys.has("bold") ||
    keys.has("italic")
  ) {
    return "text:edit";
  }

  if (
    keys.has("shape") ||
    keys.has("fillColor") ||
    keys.has("strokeColor") ||
    keys.has("strokeWidth") ||
    keys.has("customPath")
  ) {
    return "shape:edit";
  }

  if (
    keys.has("objectKind") ||
    keys.has("objectZoom") ||
    keys.has("rotationX") ||
    keys.has("rotationY") ||
    keys.has("rotationZ") ||
    keys.has("materialColor") ||
    keys.has("materialTexture")
  ) {
    return "object3d:update";
  }

  if (
    keys.has("x") ||
    keys.has("y") ||
    keys.has("width") ||
    keys.has("height") ||
    keys.has("rotation") ||
    keys.has("scaleX") ||
    keys.has("scaleY") ||
    keys.has("imageGeometry")
  ) {
    return "layer:transform";
  }

  return "layer:update";
}

function getOperationPayload(action: SharedEditorAction): Record<string, unknown> {
  const basePayload = {
    actionId: action.id,
    actionKind: action.kind,
    label: action.label,
    timestamp: action.timestamp
  };

  if (action.kind === "command") {
    return {
      ...basePayload,
      command: action.payload,
      scope: action.scope
    };
  }

  if (action.kind === "gesture") {
    return {
      ...basePayload,
      ...action.payload,
      tool: action.tool
    };
  }

  return {
    ...basePayload,
    operation: action.operation,
    ...action.payload
  };
}

function readPayloadType(payload: unknown) {
  return payload && typeof payload === "object" && "type" in payload
    ? String((payload as { type?: unknown }).type)
    : null;
}

function collectAssetReferences(manifest: WebsterProjectManifest): SharedProjectAssetReference[] {
  const references = new Map<string, SharedProjectAssetReference>();

  for (const layer of manifest.layers) {
    addLayerAssetReference(references, layer, "assetPath", "assetId", "mimeType");
    addLayerAssetReference(
      references,
      layer,
      "originalAssetPath",
      "originalAssetId",
      "originalMimeType"
    );
  }

  for (const font of manifest.fonts ?? []) {
    references.set(font.assetPath, {
      assetId: font.id,
      assetPath: font.assetPath,
      downloadUrl: `/shared-assets/${encodeURIComponent(font.assetPath)}`,
      mimeType: font.mimeType
    });
  }

  return [...references.values()];
}

function addLayerAssetReference(
  references: Map<string, SharedProjectAssetReference>,
  layer: WebsterSerializedLayer,
  pathKey: string,
  idKey: string,
  mimeTypeKey: string
) {
  const assetPath = layer[pathKey];

  if (typeof assetPath !== "string" || references.has(assetPath)) {
    return;
  }

  const assetId = layer[idKey];
  const mimeType = layer[mimeTypeKey];

  references.set(assetPath, {
    assetId: typeof assetId === "string" ? assetId : undefined,
    assetPath,
    downloadUrl: `/shared-assets/${encodeURIComponent(assetPath)}`,
    mimeType: typeof mimeType === "string" ? mimeType : undefined
  });
}
