import { MutableRefObject, useEffect, useRef } from "react";
import type { ImageLayerCommand, LayerCommand, LayerSummary } from "../../app/EditorApp";
import { EditorApp } from "../../app/EditorApp";

type UseEditorSceneRequestsOptions = {
  activeDocumentId: string;
  editorAppRef: MutableRefObject<EditorApp | null>;
  imageDocumentRequest: { file: File; id: number; tabId: string } | null;
  imageLayerCommandRequest: { command: ImageLayerCommand; id: number } | null;
  layerCommandRequest: { command: LayerCommand; id: number } | null;
  onLayersChange: (layers: LayerSummary[]) => void;
  onImageDocumentRequestHandled: (requestId: number) => void;
  onImageLayerCommandRequestHandled: (requestId: number) => void;
  onImageLayerCommandPendingChange?: (state: ImageLayerCommandPendingState | null) => void;
  onLayerCommandRequestHandled: (requestId: number) => void;
  onSceneChange: () => void;
  onSelectLayerRequestHandled: (requestId: number) => void;
  onUploadRequestHandled: (requestId: number) => void;
  selectLayerRequest: { layerId: string; id: number } | null;
  setWebglError: (error: string | null) => void;
  uploadRequest: { file: File; id: number } | null;
};

export type ImageLayerCommandPendingState = {
  message: string;
  title: string;
};

export function useEditorSceneRequests({
  activeDocumentId,
  editorAppRef,
  imageDocumentRequest,
  imageLayerCommandRequest,
  layerCommandRequest,
  onLayersChange,
  onImageDocumentRequestHandled,
  onImageLayerCommandRequestHandled,
  onImageLayerCommandPendingChange,
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

    onImageLayerCommandPendingChange?.(getImageLayerCommandPendingState(imageLayerCommandRequest.command));

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

    editorAppRef.current.selectLayer(selectLayerRequest.layerId);
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
