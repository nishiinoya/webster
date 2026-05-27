import type {
  ProjectOperation,
  ProjectOperationKind,
  ProjectOperationPhase,
  ProjectScenePatchOp,
  SharedProjectAssetReference,
  WebsterProjectManifest,
  WebsterSerializedLayer
} from "@webster/shared";
import { compare, applyPatch, deepClone } from "fast-json-patch";
import type { EditorApp } from "../app/EditorApp";
import type { SharedEditorAction } from "../app/history/SharedEditorAction";
import { serializeScenePackageAssets } from "../projects/ProjectPackage";
import { zipEntryToBlob } from "../projects/ZipStore";
import type { SerializedScene } from "../scene/Scene";
import type { SharedProjectAssetUpload } from "./sharedProjectApi";

type CreateOperationOptions = {
  action: SharedEditorAction;
  alreadyUploadedAssetPaths?: ReadonlySet<string>;
  clientId: string;
  editorApp: EditorApp;
  phase: ProjectOperationPhase;
  previousScene: WebsterProjectManifest | null;
  projectId: string;
  projectVersion: number;
};

type CreatePreviewOperationOptions = {
  alreadyUploadedAssetPaths?: ReadonlySet<string>;
  clientId: string;
  editorApp: EditorApp;
  pointer?: CollaborationPreviewPointer | null;
  previousScene: WebsterProjectManifest | null;
  projectId: string;
  projectVersion: number;
  tool: string;
};

export type CollaborationPreviewPointer = {
  velocityX: number;
  velocityY: number;
  x: number;
  y: number;
};

type CreateRealtimePreviewOperationOptions = {
  clientId: string;
  payload: Record<string, unknown>;
  projectId: string;
  projectVersion: number;
  tool: string;
};

type MaskSnapshotPayload = {
  layerId: string;
  mask: Record<string, unknown> | null;
};

export type PreparedProjectOperation = {
  assetUploads: SharedProjectAssetUpload[];
  manifest: WebsterProjectManifest;
  operation: ProjectOperation;
};

export async function createOperationFromEditorAction({
  action,
  alreadyUploadedAssetPaths,
  clientId,
  editorApp,
  phase,
  previousScene,
  projectId,
  projectVersion
}: CreateOperationOptions): Promise<PreparedProjectOperation> {
  const fastOperation = createFastOperationFromEditorAction({
    action,
    clientId,
    phase,
    previousScene,
    projectId,
    projectVersion
  });

  if (fastOperation) {
    return fastOperation;
  }

  const { assetReferences, assetUploads, manifest } =
    await createCollaborationSceneSnapshot(editorApp, projectId, alreadyUploadedAssetPaths);

  const { scene, scenePatch } = buildSceneFields(previousScene, manifest, {
    includeSceneFallback: shouldIncludeSceneFallbackForAction(action),
    preferPatch: shouldPreferPatchForAction(action)
  });
  const payload = addMaskSnapshotsToPayload(getOperationPayload(action), action, scenePatch, manifest);

  return {
    assetUploads,
    manifest,
    operation: {
      assetReferences,
      baseVersion: projectVersion,
      clientId,
      clientOperationId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind: getOperationKind(action),
      label: action.label,
      payload,
      phase,
      projectId,
      ...(scene ? { scene } : {}),
      ...(scenePatch ? { scenePatch } : {})
    }
  };
}

export async function createPreviewOperationFromEditorScene({
  alreadyUploadedAssetPaths,
  clientId,
  editorApp,
  pointer,
  previousScene,
  projectId,
  projectVersion,
  tool
}: CreatePreviewOperationOptions): Promise<PreparedProjectOperation> {
  const { assetReferences, assetUploads, manifest } =
    await createCollaborationSceneSnapshot(editorApp, projectId, alreadyUploadedAssetPaths);

  const { scene, scenePatch } = buildSceneFields(previousScene, manifest);

  return {
    assetUploads,
    manifest,
    operation: {
      assetReferences,
      baseVersion: projectVersion,
      clientId,
      clientOperationId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind: getPreviewOperationKind(tool),
      label: `${tool} preview`,
      payload: {
        pointer: pointer ?? null,
        source: "pointer-preview",
        tool
      },
      phase: "preview",
      projectId,
      ...(scene ? { scene } : {}),
      ...(scenePatch ? { scenePatch } : {})
    }
  };
}

export function createRealtimePreviewOperation({
  clientId,
  payload,
  projectId,
  projectVersion,
  tool
}: CreateRealtimePreviewOperationOptions): ProjectOperation {
  return {
    baseVersion: projectVersion,
    clientId,
    clientOperationId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: getPreviewOperationKind(tool),
    label: `${tool} preview`,
    payload,
    phase: "preview",
    projectId
  };
}

function createFastOperationFromEditorAction({
  action,
  clientId,
  phase,
  previousScene,
  projectId,
  projectVersion
}: Omit<CreateOperationOptions, "alreadyUploadedAssetPaths" | "editorApp">): PreparedProjectOperation | null {
  if (!previousScene || !isFilterOnlyLayerUpdateAction(action)) {
    return null;
  }

  const command = action.payload as {
    layerId?: unknown;
    updates?: { filters?: Record<string, unknown> };
  };
  const layerId = command.layerId;

  if (typeof layerId !== "string") {
    return null;
  }

  const layerIndex = previousScene.layers.findIndex((layer) => layer.id === layerId);

  if (layerIndex < 0) {
    return null;
  }

  const manifest = deepClone(previousScene) as WebsterProjectManifest;
  const layer = manifest.layers[layerIndex];
  const currentFilters =
    layer.filters && typeof layer.filters === "object" && !Array.isArray(layer.filters)
      ? (layer.filters as Record<string, unknown>)
      : {};
  const nextFilters = {
    ...currentFilters,
    ...command.updates?.filters
  };
  const scenePatch: ProjectScenePatchOp[] = [
    {
      op: layer.filters === undefined ? "add" : "replace",
      path: `/layers/${layerIndex}/filters`,
      value: nextFilters
    }
  ];

  layer.filters = nextFilters;

  return {
    assetUploads: [],
    manifest,
    operation: {
      assetReferences: [],
      baseVersion: projectVersion,
      clientId,
      clientOperationId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind: "filter:update",
      label: action.label,
      payload: getOperationPayload(action),
      phase,
      projectId,
      scenePatch
    }
  };
}

function isFilterOnlyLayerUpdateAction(action: SharedEditorAction) {
  if (action.kind !== "command" || readPayloadType(action.payload) !== "update") {
    return false;
  }

  const updates = (action.payload as { updates?: unknown }).updates;

  return (
    Boolean(updates) &&
    typeof updates === "object" &&
    updates !== null &&
    !Array.isArray(updates) &&
    Object.keys(updates).length === 1 &&
    "filters" in updates
  );
}

function shouldPreferPatchForAction(action: SharedEditorAction) {
  if (
    action.kind === "gesture" &&
    (action.tool === "Draw" || action.tool === "Mask Brush" || action.tool === "Crop")
  ) {
    return true;
  }

  if (action.kind === "scene" && (action.operation === "undo" || action.operation === "redo")) {
    return true;
  }

  if (action.kind === "command" && readPayloadType(action.payload) === "mask") {
    return true;
  }

  return false;
}

function shouldIncludeSceneFallbackForAction(action: SharedEditorAction) {
  return action.kind === "gesture" && action.tool === "Crop";
}

function buildSceneFields(
  previousScene: WebsterProjectManifest | null,
  currentScene: WebsterProjectManifest,
  options: { includeSceneFallback?: boolean; preferPatch?: boolean } = {}
): { scene?: WebsterProjectManifest; scenePatch?: ProjectScenePatchOp[] } {
  if (!previousScene) {
    return { scene: currentScene };
  }

  const patch = compare(previousScene, currentScene) as ProjectScenePatchOp[];
  if (patch.length === 0) {
    return { scenePatch: [] };
  }

  if (options.preferPatch) {
    return {
      ...(options.includeSceneFallback ? { scene: currentScene } : {}),
      scenePatch: patch
    };
  }

  const sceneSize = JSON.stringify(currentScene).length;
  const patchSize = JSON.stringify(patch).length;
  if (patchSize * 4 > sceneSize) {
    return { scene: currentScene };
  }

  return { scenePatch: patch };
}

export function computeSceneDiff(
  from: WebsterProjectManifest,
  to: WebsterProjectManifest
): ProjectScenePatchOp[] {
  return compare(from, to) as ProjectScenePatchOp[];
}

export function dedupeManifestLayers(
  manifest: WebsterProjectManifest
): WebsterProjectManifest {
  const layers = manifest.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    return manifest;
  }

  const lastIndexById = new Map<string, number>();
  layers.forEach((layer, index) => {
    if (layer && typeof layer.id === "string") {
      lastIndexById.set(layer.id, index);
    }
  });

  const deduped = layers.filter((layer, index) => {
    if (!layer || typeof layer.id !== "string") {
      return true;
    }
    return lastIndexById.get(layer.id) === index;
  });

  if (deduped.length === layers.length) {
    return manifest;
  }

  return { ...manifest, layers: deduped };
}

export function applyScenePatch(
  base: WebsterProjectManifest,
  patch: ProjectScenePatchOp[]
): WebsterProjectManifest {
  const cloned = deepClone(base) as WebsterProjectManifest;
  return applyPatch(cloned, patch as unknown as never[], false, true).newDocument as WebsterProjectManifest;
}

export function applyMaskSnapshotFallback(
  base: WebsterProjectManifest,
  operation: ProjectOperation
): WebsterProjectManifest | null {
  const snapshots = readMaskSnapshots(operation.payload?.maskSnapshots);

  if (!snapshots.length) {
    return null;
  }

  const cloned = deepClone(base) as WebsterProjectManifest;
  let didApply = false;

  for (const snapshot of snapshots) {
    const layer = cloned.layers.find((candidate) => candidate.id === snapshot.layerId);

    if (!layer) {
      continue;
    }

    layer.mask = snapshot.mask;
    didApply = true;
  }

  return didApply ? cloned : null;
}

export class ScenePatchApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenePatchApplyError";
  }
}

export async function applyOperationToScene(
  editorApp: EditorApp,
  operation: ProjectOperation,
  assets = new Map<string, Blob>(),
  currentManifest: WebsterProjectManifest | null = null
): Promise<WebsterProjectManifest | null> {
  let resolved: WebsterProjectManifest | null = null;

  if (operation.scenePatch && operation.scenePatch.length > 0) {
    if (!currentManifest) {
      if (operation.scene) {
        resolved = operation.scene;
      } else {
        throw new ScenePatchApplyError("No local base manifest to apply patch against");
      }
    } else {
      try {
        resolved = applyScenePatch(currentManifest, operation.scenePatch);
      } catch (err) {
        if (operation.scene) {
          resolved = operation.scene;
        } else {
          resolved = applyMaskSnapshotFallback(currentManifest, operation);
        }

        if (!resolved) {
          throw new ScenePatchApplyError(
            `Failed to apply scene patch: ${(err as Error).message}`
          );
        }
      }
    }
  } else if (operation.scene) {
    resolved = operation.scene;
  }

  if (!resolved) {
    return null;
  }

  await editorApp.importSerializedScene(resolved as unknown as SerializedScene, assets, {
    historyLabel: operation.phase === "preview" ? "Remote preview" : "Remote update"
  });

  return resolved;
}

function addMaskSnapshotsToPayload(
  payload: Record<string, unknown>,
  action: SharedEditorAction,
  patch: ProjectScenePatchOp[] | undefined,
  manifest: WebsterProjectManifest
) {
  if (!patch?.length || !shouldAttachMaskSnapshots(action, patch)) {
    return payload;
  }

  const maskSnapshots = createMaskSnapshotsFromPatch(patch, manifest);

  return maskSnapshots.length > 0 ? { ...payload, maskSnapshots } : payload;
}

function shouldAttachMaskSnapshots(action: SharedEditorAction, patch: ProjectScenePatchOp[]) {
  if (action.kind === "gesture" && action.tool === "Mask Brush") {
    return true;
  }

  if (action.kind === "command" && readPayloadType(action.payload) === "mask") {
    return true;
  }

  return (
    action.kind === "scene" &&
    (action.operation === "undo" || action.operation === "redo") &&
    isMaskOnlyPatch(patch)
  );
}

function isMaskOnlyPatch(patch: ProjectScenePatchOp[]) {
  return patch.length > 0 && patch.every((operation) => /^\/layers\/\d+\/mask(?:\/|$)/u.test(operation.path));
}

function createMaskSnapshotsFromPatch(
  patch: ProjectScenePatchOp[],
  manifest: WebsterProjectManifest
): MaskSnapshotPayload[] {
  const layerIndexes = new Set<number>();

  for (const operation of patch) {
    const match = /^\/layers\/(\d+)\/mask(?:\/|$)/u.exec(operation.path);

    if (!match) {
      continue;
    }

    layerIndexes.add(Number(match[1]));
  }

  return [...layerIndexes]
    .map((layerIndex) => manifest.layers[layerIndex] ?? null)
    .filter((layer): layer is WebsterSerializedLayer => Boolean(layer))
    .map((layer) => ({
      layerId: layer.id,
      mask: readSerializedMask(layer.mask)
    }));
}

function readMaskSnapshots(value: unknown): MaskSnapshotPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((snapshot) => {
      if (!snapshot || typeof snapshot !== "object") {
        return null;
      }

      const layerId = (snapshot as { layerId?: unknown }).layerId;
      const mask = readSerializedMask((snapshot as { mask?: unknown }).mask);

      return typeof layerId === "string" ? { layerId, mask } : null;
    })
    .filter((snapshot): snapshot is MaskSnapshotPayload => Boolean(snapshot));
}

function readSerializedMask(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const mask = value as Record<string, unknown>;

  return (
    typeof mask.data === "string" &&
    typeof mask.enabled === "boolean" &&
    typeof mask.height === "number" &&
    typeof mask.id === "string" &&
    typeof mask.width === "number"
  )
    ? {
        data: mask.data,
        enabled: mask.enabled,
        height: mask.height,
        id: mask.id,
        width: mask.width
      }
    : null;
}

function stripVolatileManifestFields(
  manifest: WebsterProjectManifest
): WebsterProjectManifest {
  return {
    ...manifest,
    selectedLayerId: null,
    selectedLayerIds: []
  };
}

async function createCollaborationSceneSnapshot(
  editorApp: EditorApp,
  projectId: string,
  alreadyUploadedAssetPaths?: ReadonlySet<string>
) {
  const { assetEntries, manifest: rawManifest } = await serializeScenePackageAssets(
    editorApp.getScene(),
    undefined,
    alreadyUploadedAssetPaths ? { skipAssetPaths: alreadyUploadedAssetPaths } : {}
  );

  const manifest = stripVolatileManifestFields(rawManifest as WebsterProjectManifest);
  const assetUploads = assetEntries.map((entry) => {
    const mimeType = inferAssetMimeType(entry.name);

    return {
      assetId: getAssetIdForPath(manifest as WebsterProjectManifest, entry.name),
      assetPath: entry.name,
      blob: zipEntryToBlob(entry, mimeType),
      mimeType
    } satisfies SharedProjectAssetUpload;
  });

  await collectEmbeddedTextureUploads(manifest as WebsterProjectManifest, assetUploads, projectId);

  return {
    assetReferences: createAssetReferences(
      manifest as WebsterProjectManifest,
      assetUploads,
      projectId,
      alreadyUploadedAssetPaths
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
    keys.has("materialTexture") ||
    keys.has("materialTextureImage") ||
    keys.has("modelMaterials") ||
    keys.has("lightX") ||
    keys.has("lightY") ||
    keys.has("lightZ") ||
    keys.has("lightIntensity") ||
    keys.has("ambient") ||
    keys.has("shadowOpacity") ||
    keys.has("shadowDistance") ||
    keys.has("shadowSoftness")
  ) {
    return "object3d:update";
  }

  if (
    keys.has("x") ||
    keys.has("y") ||
    keys.has("width") ||
    keys.has("height") ||
    keys.has("rotation") ||
    keys.has("resetCrop") ||
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
  projectId: string,
  alreadyUploadedAssetPaths?: ReadonlySet<string>
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
    addObject3DModelAssetReferences(references, layer, projectId, alreadyUploadedAssetPaths);
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

function addObject3DModelAssetReferences(
  references: Map<string, SharedProjectAssetReference>,
  layer: WebsterSerializedLayer,
  projectId: string,
  alreadyUploadedAssetPaths?: ReadonlySet<string>
) {
  if (layer.type !== "object3d") {
    return;
  }

  const model = layer["model"];

  if (!model || typeof model !== "object" || !("assetPath" in model)) {
    return;
  }

  const assetPath = (model as { assetPath?: unknown }).assetPath;

  if (typeof assetPath !== "string") {
    return;
  }

  addKnownAssetReference(references, assetPath, projectId);

  if (!alreadyUploadedAssetPaths) {
    return;
  }

  const modelDirectory = assetPath.replace(/\/[^/]*$/u, "");

  for (const uploadedAssetPath of alreadyUploadedAssetPaths) {
    if (
      uploadedAssetPath === assetPath ||
      uploadedAssetPath.startsWith(`${modelDirectory}/`)
    ) {
      addKnownAssetReference(references, uploadedAssetPath, projectId);
    }
  }
}

function addKnownAssetReference(
  references: Map<string, SharedProjectAssetReference>,
  assetPath: string,
  projectId: string
) {
  if (references.has(assetPath)) {
    return;
  }

  references.set(assetPath, {
    assetPath,
    downloadUrl: getDefaultAssetDownloadUrl(projectId, assetPath),
    mimeType: inferAssetMimeType(assetPath)
  });
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
