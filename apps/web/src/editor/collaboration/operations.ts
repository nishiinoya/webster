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
import { serializeScenePackageAssets } from "../projects/ProjectPackage";
import type { SerializedScene } from "../scene/Scene";
import type { SharedProjectAssetUpload } from "./sharedProjectApi";

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

export type PreparedProjectOperation = {
  assetUploads: SharedProjectAssetUpload[];
  operation: ProjectOperation;
};

export async function createOperationFromEditorAction({
  action,
  clientId,
  editorApp,
  phase,
  projectId,
  projectVersion
}: CreateOperationOptions): Promise<PreparedProjectOperation> {
  const { assetReferences, assetUploads, manifest } =
    await createCollaborationSceneSnapshot(editorApp, projectId);

  return {
    assetUploads,
    operation: {
      assetReferences,
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
    }
  };
}

export async function createPreviewOperationFromEditorScene({
  clientId,
  editorApp,
  projectId,
  projectVersion,
  tool
}: CreatePreviewOperationOptions): Promise<PreparedProjectOperation> {
  const { assetReferences, assetUploads, manifest } =
    await createCollaborationSceneSnapshot(editorApp, projectId);

  return {
    assetUploads,
    operation: {
      assetReferences,
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
    }
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

async function createCollaborationSceneSnapshot(
  editorApp: EditorApp,
  projectId: string
) {
  const { assetEntries, manifest } = await serializeScenePackageAssets(editorApp.getScene());
  const assetUploads = assetEntries.map((entry) => {
    const mimeType = inferAssetMimeType(entry.name);

    return {
      assetId: getAssetIdForPath(manifest as WebsterProjectManifest, entry.name),
      assetPath: entry.name,
      blob: new Blob([toBlobPart(entry.data)], { type: mimeType }),
      mimeType
    } satisfies SharedProjectAssetUpload;
  });

  await collectEmbeddedTextureUploads(manifest as WebsterProjectManifest, assetUploads, projectId);

  return {
    assetReferences: createAssetReferences(
      manifest as WebsterProjectManifest,
      assetUploads,
      projectId
    ),
    assetUploads,
    manifest: manifest as WebsterProjectManifest
  };
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
    case "create-3d-model-layer":
    case "create-loaded-3d-model-layer":
    case "duplicate":
    case "group":
      return "layer:create";
    case "clear-shape-texture":
    case "import-font":
    case "import-shape-texture":
      return "asset:create";
    case "clear-3d-material-texture":
    case "import-3d-material-texture":
    case "import-3d-model":
    case "replace-loaded-3d-model":
      return "object3d:update";
    case "delete":
      return "layer:delete";
    case "move-down":
    case "move-to-position":
    case "move-up":
    case "remove-from-group":
      return "layer:reorder";
    case "mask":
      return "mask:paint";
    case "nudge":
      return "layer:transform";
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

function createAssetReferences(
  manifest: WebsterProjectManifest,
  assetUploads: SharedProjectAssetUpload[],
  projectId: string
) {
  const references = new Map<string, SharedProjectAssetReference>();

  for (const layer of manifest.layers) {
    addLayerAssetReference(references, layer, "assetPath", "assetId", "mimeType", projectId);
    addLayerAssetReference(
      references,
      layer,
      "originalAssetPath",
      "originalAssetId",
      "originalMimeType",
      projectId
    );
    addTextureAssetReferences(references, layer, projectId);
  }

  for (const font of manifest.fonts ?? []) {
    references.set(font.assetPath, {
      assetId: font.id,
      assetPath: font.assetPath,
      downloadUrl: getDefaultAssetDownloadUrl(projectId, font.assetPath),
      mimeType: font.mimeType
    });
  }

  for (const upload of assetUploads) {
    references.set(upload.assetPath, {
      assetId: upload.assetId,
      assetPath: upload.assetPath,
      downloadUrl: getDefaultAssetDownloadUrl(projectId, upload.assetPath),
      mimeType: upload.mimeType || upload.blob.type || inferAssetMimeType(upload.assetPath)
    });
  }

  return [...references.values()];
}

function addLayerAssetReference(
  references: Map<string, SharedProjectAssetReference>,
  layer: WebsterSerializedLayer,
  pathKey: string,
  idKey: string,
  mimeTypeKey: string,
  projectId: string
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
    downloadUrl: getDefaultAssetDownloadUrl(projectId, assetPath),
    mimeType: typeof mimeType === "string" ? mimeType : undefined
  });
}

async function collectEmbeddedTextureUploads(
  manifest: WebsterProjectManifest,
  assetUploads: SharedProjectAssetUpload[],
  projectId: string
) {
  const seenAssetPaths = new Set(assetUploads.map((asset) => asset.assetPath));

  for (const layer of manifest.layers) {
    await addEmbeddedTextureUpload(
      assetUploads,
      seenAssetPaths,
      layer,
      layer["textureImage"],
      "shape-texture",
      projectId
    );
    await addEmbeddedTextureUpload(
      assetUploads,
      seenAssetPaths,
      layer,
      layer["materialTextureImage"],
      "material-texture",
      projectId
    );

    const modelMaterials = layer["modelMaterials"];

    if (Array.isArray(modelMaterials)) {
      for (const [index, material] of modelMaterials.entries()) {
        if (material && typeof material === "object" && "textureImage" in material) {
          await addEmbeddedTextureUpload(
            assetUploads,
            seenAssetPaths,
            layer,
            (material as { textureImage?: unknown }).textureImage,
            `model-material-${index}`,
            projectId
          );
        }
      }
    }
  }
}

async function addEmbeddedTextureUpload(
  assetUploads: SharedProjectAssetUpload[],
  seenAssetPaths: Set<string>,
  layer: WebsterSerializedLayer,
  value: unknown,
  role: string,
  projectId: string
) {
  if (!isSerializedTexture(value) || !isInlineTextureUrl(value.dataUrl)) {
    return;
  }

  const blob = await fetch(value.dataUrl).then((response) => response.blob());
  const mimeType = normalizeMimeType(value.mimeType, blob.type);
  const assetPath =
    value.assetPath ?? getTextureAssetPath(layer.id, role, value.id, value.name, mimeType);

  value.assetPath = assetPath;
  value.dataUrl = getDefaultAssetDownloadUrl(projectId, assetPath);

  if (seenAssetPaths.has(assetPath)) {
    return;
  }

  seenAssetPaths.add(assetPath);
  assetUploads.push({
    assetId: value.id,
    assetPath,
    blob,
    mimeType
  });
}

function addTextureAssetReferences(
  references: Map<string, SharedProjectAssetReference>,
  layer: WebsterSerializedLayer,
  projectId: string
) {
  addTextureAssetReference(references, layer["textureImage"], projectId);
  addTextureAssetReference(references, layer["materialTextureImage"], projectId);

  const modelMaterials = layer["modelMaterials"];

  if (Array.isArray(modelMaterials)) {
    for (const material of modelMaterials) {
      if (material && typeof material === "object" && "textureImage" in material) {
        addTextureAssetReference(
          references,
          (material as { textureImage?: unknown }).textureImage,
          projectId
        );
      }
    }
  }
}

function addTextureAssetReference(
  references: Map<string, SharedProjectAssetReference>,
  value: unknown,
  projectId: string
) {
  if (!isSerializedTexture(value) || !value.assetPath || references.has(value.assetPath)) {
    return;
  }

  references.set(value.assetPath, {
    assetId: value.id,
    assetPath: value.assetPath,
    downloadUrl: getDefaultAssetDownloadUrl(projectId, value.assetPath),
    mimeType: value.mimeType
  });
}

function getAssetIdForPath(manifest: WebsterProjectManifest, assetPath: string) {
  for (const layer of manifest.layers) {
    if (layer.assetPath === assetPath && typeof layer.assetId === "string") {
      return layer.assetId;
    }

    if (
      layer.originalAssetPath === assetPath &&
      typeof layer.originalAssetId === "string"
    ) {
      return layer.originalAssetId;
    }

    const textureId = getTextureIdForPath(layer["textureImage"], assetPath)
      ?? getTextureIdForPath(layer["materialTextureImage"], assetPath);

    if (textureId) {
      return textureId;
    }
  }

  const font = manifest.fonts?.find((candidate) => candidate.assetPath === assetPath);

  return font?.id;
}

function getTextureIdForPath(value: unknown, assetPath: string) {
  return isSerializedTexture(value) && value.assetPath === assetPath ? value.id : undefined;
}

type SerializedTextureRecord = {
  assetPath?: string;
  dataUrl: string;
  height?: number;
  id?: string;
  mimeType?: string;
  name?: string;
  projectId?: string;
  width?: number;
};

function isSerializedTexture(value: unknown): value is SerializedTextureRecord {
  return Boolean(value && typeof value === "object" && typeof (value as { dataUrl?: unknown }).dataUrl === "string");
}

function isInlineTextureUrl(value: string) {
  return value.startsWith("data:") || value.startsWith("blob:");
}

function getTextureAssetPath(
  layerId: string,
  role: string,
  textureId: string | undefined,
  textureName: string | undefined,
  mimeType: string
) {
  const extension = getAssetExtension(mimeType);
  const safeLayerId = sanitizeAssetPathSegment(layerId);
  const safeTextureId = sanitizeAssetPathSegment(textureId || textureName || role);

  return `assets/textures/${safeLayerId}-${sanitizeAssetPathSegment(role)}-${safeTextureId}.${extension}`;
}

function getDefaultAssetDownloadUrl(projectId: string | undefined, assetPath: string) {
  const encodedPath = encodeURIComponent(assetPath);

  return projectId
    ? `/shared-projects/${encodeURIComponent(projectId)}/assets/${encodedPath}`
    : `/shared-assets/${encodedPath}`;
}

function inferAssetMimeType(assetPath: string) {
  const lowerPath = assetPath.toLowerCase();

  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lowerPath.endsWith(".webp")) {
    return "image/webp";
  }

  if (lowerPath.endsWith(".png")) {
    return "image/png";
  }

  if (lowerPath.endsWith(".json")) {
    return "application/json";
  }

  if (lowerPath.endsWith(".woff")) {
    return "font/woff";
  }

  if (lowerPath.endsWith(".woff2")) {
    return "font/woff2";
  }

  if (lowerPath.endsWith(".ttf")) {
    return "font/ttf";
  }

  if (lowerPath.endsWith(".otf")) {
    return "font/otf";
  }

  return "application/octet-stream";
}

function normalizeMimeType(primary: string | undefined, fallback: string | undefined) {
  return primary || fallback || "application/octet-stream";
}

function getAssetExtension(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "png";
}

function sanitizeAssetPathSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-z0-9._-]+/giu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 80) || "asset"
  );
}

function toBlobPart(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
