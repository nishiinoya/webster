/** Hook that coordinates async scene commands, imports, exports, and UI loading state. */
import { MutableRefObject, useEffect, useRef } from "react";
import type {
  ImageLayerCommand,
  LayerAssetCommand,
  LayerCommand,
  LayerSummary
} from "../../app/EditorApp";
import { EditorApp } from "../../app/EditorApp";

type UseEditorSceneRequestsOptions = {
  activeDocumentId: string;
  editorAppRef: MutableRefObject<EditorApp | null>;
  imageDocumentRequest: { file: File; id: number; tabId: string } | null;
  imageLayerCommandRequest: { command: ImageLayerCommand; id: number } | null;
  layerAssetCommandRequest: { command: LayerAssetCommand; id: number } | null;
  layerCommandRequest: { command: LayerCommand; id: number } | null;
  onLayersChange: (layers: LayerSummary[]) => void;
  onImageDocumentRequestHandled: (requestId: number) => void;
  onImageLayerCommandRequestHandled: (requestId: number) => void;
  onImageLayerCommandPendingChange?: (state: ImageLayerCommandPendingState | null) => void;
  onLayerAssetCommandPendingChange?: (state: LayerAssetCommandPendingState | null) => void;
  onLayerAssetCommandRequestHandled: (requestId: number) => void;
  onLayerCommandRequestHandled: (requestId: number) => void;
  onSceneChange: () => void;
  onSelectLayerRequestHandled: (requestId: number) => void;
  onUploadRequestHandled: (requestId: number) => void;
  selectLayerRequest: { layerIds: string[]; id: number } | null;
  setWebglError: (error: string | null) => void;
  uploadRequest: { file: File; id: number } | null;
};

export type ImageLayerCommandPendingState = {
  message: string;
  title: string;
};

export type LayerAssetCommandPendingState = {
  appliedTextureNames?: string[];
  assetCount?: number;
  guessedTextureMaps?: string[];
  materialCount?: number;
  materialName?: string | null;
  materialNames?: string[];
  message: string;
  modelName?: string | null;
  partCount?: number;
  progress: number;
  sourceFormat?: string | null;
  status: "complete" | "error" | "importing";
  textureCount?: number;
  textureName?: string | null;
  textureNames?: string[];
  title: string;
  triangleCount?: number;
  unassignedTextureNames?: string[];
  vertexCount?: number;
  warnings?: string[];
};

export function useEditorSceneRequests({
  activeDocumentId,
  editorAppRef,
  imageDocumentRequest,
  imageLayerCommandRequest,
  layerAssetCommandRequest,
  layerCommandRequest,
  onLayersChange,
  onImageDocumentRequestHandled,
  onImageLayerCommandRequestHandled,
  onImageLayerCommandPendingChange,
  onLayerAssetCommandPendingChange,
  onLayerAssetCommandRequestHandled,
  onLayerCommandRequestHandled,
  onSceneChange,
  onSelectLayerRequestHandled,
  onUploadRequestHandled,
  selectLayerRequest,
  setWebglError,
  uploadRequest
}: UseEditorSceneRequestsOptions) {
  const handledImageDocumentRequestIdRef = useRef<number | null>(null);
  const handledImageLayerCommandRequestIdRef = useRef<number | null>(null);
  const handledLayerAssetCommandRequestIdRef = useRef<number | null>(null);
  const handledLayerCommandRequestIdRef = useRef<number | null>(null);
  const handledSelectLayerRequestIdRef = useRef<number | null>(null);
  const handledUploadRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!imageDocumentRequest || !editorAppRef.current) {
      return;
    }

    if (imageDocumentRequest.tabId !== activeDocumentId) {
      return;
    }

    if (handledImageDocumentRequestIdRef.current === imageDocumentRequest.id) {
      return;
    }

    handledImageDocumentRequestIdRef.current = imageDocumentRequest.id;
    const requestId = imageDocumentRequest.id;

    let didCancel = false;

    editorAppRef.current
      .createImageDocument(imageDocumentRequest.file)
      .then(() => {
        if (!didCancel && editorAppRef.current) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
          onSceneChange();
        }
      })
      .catch((error) => {
        if (!didCancel) {
          setWebglError(error instanceof Error ? error.message : "Unable to open image.");
        }
      })
      .finally(() => {
        if (!didCancel) {
          onImageDocumentRequestHandled(requestId);
        }
      });

    return () => {
      didCancel = true;
    };
  }, [
    activeDocumentId,
    editorAppRef,
    imageDocumentRequest,
    onImageDocumentRequestHandled,
    onLayersChange,
    onSceneChange,
    setWebglError
  ]);

  useEffect(() => {
    if (!imageLayerCommandRequest || !editorAppRef.current) {
      return;
    }

    if (handledImageLayerCommandRequestIdRef.current === imageLayerCommandRequest.id) {
      return;
    }

    handledImageLayerCommandRequestIdRef.current = imageLayerCommandRequest.id;
    const requestId = imageLayerCommandRequest.id;
    let didCancel = false;

    onImageLayerCommandPendingChange?.(
      getImageLayerCommandPendingState(imageLayerCommandRequest.command)
    );

    const runImageLayerCommand = async () => {
      const startedAt = performance.now();

      // Give React/browser one paint so the progress dialog appears before canvas resampling blocks.
      await waitForNextPaint();
      await editorAppRef.current?.applyImageLayerCommand(imageLayerCommandRequest.command);

      const elapsed = performance.now() - startedAt;
      const minimumVisibleTime = 450;

      if (elapsed < minimumVisibleTime) {
        await wait(minimumVisibleTime - elapsed);
      }
    };

    runImageLayerCommand()
      .then(() => {
        if (!didCancel && editorAppRef.current) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
          onSceneChange();
        }
      })
      .catch((error) => {
        if (!didCancel) {
          setWebglError(error instanceof Error ? error.message : "Unable to resample image.");
        }
      })
      .finally(() => {
        if (!didCancel) {
          onImageLayerCommandPendingChange?.(null);
          onImageLayerCommandRequestHandled(requestId);
        }
      });

    return () => {
      didCancel = true;
      onImageLayerCommandPendingChange?.(null);
    };
  }, [
    editorAppRef,
    imageLayerCommandRequest,
    onImageLayerCommandRequestHandled,
    onImageLayerCommandPendingChange,
    onLayersChange,
    onSceneChange,
    setWebglError
  ]);

  useEffect(() => {
    if (!layerAssetCommandRequest || !editorAppRef.current) {
      return;
    }

    if (handledLayerAssetCommandRequestIdRef.current === layerAssetCommandRequest.id) {
      return;
    }

    handledLayerAssetCommandRequestIdRef.current = layerAssetCommandRequest.id;
    const request = layerAssetCommandRequest;
    const requestId = request.id;
    let didCancel = false;

    const isModelImport = isModelLayerAssetCommand(request.command);

    async function runLayerAssetCommand() {
      if (isModelImport) {
        onLayerAssetCommandPendingChange?.(
          getLayerAssetCommandPendingState(request.command, 12)
        );
        await waitForNextPaint();
        onLayerAssetCommandPendingChange?.(
          getLayerAssetCommandPendingState(request.command, 58)
        );
      }

      const result = await editorAppRef.current?.applyLayerAssetCommand(request.command);

      if (isModelImport) {
        onLayerAssetCommandPendingChange?.(getCompletedModelImportState(result));
        await wait(350);
      }
    }

    runLayerAssetCommand()
      .then(() => {
        if (!didCancel && editorAppRef.current) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
          onSceneChange();
        }
      })
      .catch((error) => {
        if (!didCancel) {
          if (isModelImport) {
            onLayerAssetCommandPendingChange?.({
              message:
                error instanceof Error
                  ? error.message
                  : "The model package could not be imported.",
              progress: 100,
              status: "error",
              title: "3D import failed"
            });
          }
          setWebglError(error instanceof Error ? error.message : "Unable to import layer asset.");
        }
      })
      .finally(() => {
        if (!didCancel) {
          onLayerAssetCommandRequestHandled(requestId);
        }
      });

    return () => {
      didCancel = true;
    };
  }, [
    editorAppRef,
    layerAssetCommandRequest,
    onLayerAssetCommandPendingChange,
    onLayerAssetCommandRequestHandled,
    onLayersChange,
    onSceneChange,
    setWebglError
  ]);

  useEffect(() => {
    if (!uploadRequest || !editorAppRef.current) {
      return;
    }

    if (handledUploadRequestIdRef.current === uploadRequest.id) {
      return;
    }

    handledUploadRequestIdRef.current = uploadRequest.id;
    const requestId = uploadRequest.id;

    let didCancel = false;

    editorAppRef.current
      .addImageFile(uploadRequest.file)
      .then(() => {
        if (!didCancel && editorAppRef.current) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
        }
      })
      .catch((error) => {
        if (!didCancel) {
          setWebglError(error instanceof Error ? error.message : "Unable to add image.");
        }
      })
      .finally(() => {
        if (!didCancel) {
          onUploadRequestHandled(requestId);
        }
      });

    return () => {
      didCancel = true;
    };
  }, [editorAppRef, onLayersChange, onUploadRequestHandled, setWebglError, uploadRequest]);

  useEffect(() => {
    if (!selectLayerRequest || !editorAppRef.current) {
      return;
    }

    if (handledSelectLayerRequestIdRef.current === selectLayerRequest.id) {
      return;
    }

    handledSelectLayerRequestIdRef.current = selectLayerRequest.id;
    onSelectLayerRequestHandled(selectLayerRequest.id);

    editorAppRef.current.selectLayers(selectLayerRequest.layerIds);
    onLayersChange(editorAppRef.current.getLayerSummaries());
  }, [editorAppRef, onLayersChange, onSelectLayerRequestHandled, selectLayerRequest]);

  useEffect(() => {
    if (!layerCommandRequest || !editorAppRef.current) {
      return;
    }

    if (handledLayerCommandRequestIdRef.current === layerCommandRequest.id) {
      return;
    }

    handledLayerCommandRequestIdRef.current = layerCommandRequest.id;
    onLayerCommandRequestHandled(layerCommandRequest.id);

    editorAppRef.current.applyLayerCommand(layerCommandRequest.command);
    onLayersChange(editorAppRef.current.getLayerSummaries());
  }, [editorAppRef, layerCommandRequest, onLayerCommandRequestHandled, onLayersChange]);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function getImageLayerCommandPendingState(
  command: ImageLayerCommand
): ImageLayerCommandPendingState {
  if (command.type === "restore-original") {
    return {
      message: "Restoring the saved original texture.",
      title: "Restoring original image..."
    };
  }

  return {
    message: "Rebuilding the image texture pixels.",
    title: "Resampling image..."
  };
}

function isModelLayerAssetCommand(command: LayerAssetCommand) {
  return (
    command.type === "create-3d-model-layer" ||
    command.type === "create-loaded-3d-model-layer" ||
    command.type === "import-3d-model" ||
    command.type === "replace-loaded-3d-model"
  );
}

function getLayerAssetCommandPendingState(
  command: LayerAssetCommand,
  progress: number
): LayerAssetCommandPendingState {
  const fileCount = "files" in command ? command.files.length : 0;

  return {
    message:
      fileCount > 1
        ? `Reading ${fileCount} model package files and searching for materials.`
        : "Reading the model package and searching for materials.",
    progress,
    status: "importing",
    title: progress < 50 ? "Preparing 3D import..." : "Loading 3D model..."
  };
}

function getCompletedModelImportState(result: unknown): LayerAssetCommandPendingState {
  const summary = getModelImportResultSummary(result);

  const appliedTextureCount = summary.appliedTextureNames.length;
  const loadedTextureCount = summary.textureNames.length || summary.textureCount;

  let message = "No browser-readable material texture was found.";

  if (appliedTextureCount > 1) {
    message = `Applied ${appliedTextureCount} material textures.`;
  } else if (appliedTextureCount === 1) {
    message = `Applied ${summary.appliedTextureNames[0]} to the model material.`;
  } else if (loadedTextureCount > 0) {
    message = `Found ${loadedTextureCount} texture file${loadedTextureCount === 1 ? "" : "s"}, but none matched OBJ materials.`;
  }

  return {
    appliedTextureNames: summary.appliedTextureNames,
    assetCount: summary.assetCount,
    guessedTextureMaps: summary.guessedTextureMaps,
    materialCount: summary.materialCount,
    materialName: summary.materialName,
    materialNames: summary.materialNames,
    message,
    modelName: summary.modelName,
    partCount: summary.partCount,
    progress: 100,
    sourceFormat: summary.sourceFormat,
    status: "complete",
    textureCount: summary.textureCount,
    textureName: summary.textureName,
    textureNames: summary.textureNames,
    triangleCount: summary.triangleCount,
    unassignedTextureNames: summary.unassignedTextureNames,
    vertexCount: summary.vertexCount,
    warnings: summary.warnings,
    title: summary.modelName ? `Imported ${summary.modelName}` : "3D import complete"
  };
}

function getModelImportResultSummary(result: unknown) {
  if (!result || typeof result !== "object") {
    return {
      appliedTextureNames: [],
      assetCount: 0,
      materialCount: 0,
      materialName: null,
      materialNames: [],
      modelName: null,
      guessedTextureMaps: [],
      partCount: 0,
      sourceFormat: null,
      textureCount: 0,
      textureName: null,
      textureNames: [],
      triangleCount: 0,
      unassignedTextureNames: [],
      vertexCount: 0,
      warnings: []
    };
  }

  const maybeResult = result as {
    appliedTextureNames?: unknown;
    assetCount?: unknown;
    layer?: { modelName?: unknown } | null;
    material?: { name?: unknown } | null;
    materialCount?: unknown;
    materialName?: unknown;
    materialNames?: unknown;
    modelName?: unknown;
    guessedTextureMaps?: unknown;
    partCount?: unknown;
    sourceFormat?: unknown;
    textureAsset?: { file?: { name?: unknown }; name?: unknown } | null;
    textureCount?: unknown;
    textureName?: unknown;
    textureNames?: unknown;
    triangleCount?: unknown;
    unassignedTextureNames?: unknown;
    vertexCount?: unknown;
    warnings?: unknown;
  };

  const materialNames = readStringArray(maybeResult.materialNames);
  const textureNames = readStringArray(maybeResult.textureNames);
  const appliedTextureNames = readStringArray(maybeResult.appliedTextureNames);
  const guessedTextureMaps = readStringArray(maybeResult.guessedTextureMaps);
  const unassignedTextureNames = readStringArray(maybeResult.unassignedTextureNames);
  const warnings = readStringArray(maybeResult.warnings);

  const materialName =
    readString(maybeResult.materialName) ??
    readString(maybeResult.material?.name) ??
    materialNames[0] ??
    null;

  const textureName =
    readString(maybeResult.textureName) ??
    readString(maybeResult.textureAsset?.file?.name) ??
    readString(maybeResult.textureAsset?.name) ??
    appliedTextureNames[0] ??
    textureNames[0] ??
    null;

  const modelName =
    readString(maybeResult.modelName) ??
    readString(maybeResult.layer?.modelName) ??
    null;

  return {
    appliedTextureNames,
    assetCount: typeof maybeResult.assetCount === "number" ? maybeResult.assetCount : 0,
    materialCount:
      typeof maybeResult.materialCount === "number"
        ? maybeResult.materialCount
        : materialNames.length,
    materialName,
    materialNames,
    modelName,
    guessedTextureMaps,
    partCount: typeof maybeResult.partCount === "number" ? maybeResult.partCount : 0,
    sourceFormat: readString(maybeResult.sourceFormat),
    textureCount:
      typeof maybeResult.textureCount === "number"
        ? maybeResult.textureCount
        : textureNames.length,
    textureName,
    textureNames,
    triangleCount: typeof maybeResult.triangleCount === "number" ? maybeResult.triangleCount : 0,
    unassignedTextureNames,
    vertexCount: typeof maybeResult.vertexCount === "number" ? maybeResult.vertexCount : 0,
    warnings
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  ];
}
