import { MutableRefObject, useEffect, useRef } from "react";
import type { LayerCommand, LayerSummary } from "../../app/EditorApp";
import { EditorApp } from "../../app/EditorApp";

type UseEditorSceneRequestsOptions = {
  editorAppRef: MutableRefObject<EditorApp | null>;
  layerCommandRequest: { command: LayerCommand; id: number } | null;
  onLayersChange: (layers: LayerSummary[]) => void;
  onLayerCommandRequestHandled: (requestId: number) => void;
  onSelectLayerRequestHandled: (requestId: number) => void;
  onUploadRequestHandled: (requestId: number) => void;
  selectLayerRequest: { layerId: string; id: number } | null;
  setWebglError: (error: string | null) => void;
  uploadRequest: { file: File; id: number } | null;
};

export function useEditorSceneRequests({
  editorAppRef,
  layerCommandRequest,
  onLayersChange,
  onLayerCommandRequestHandled,
  onSelectLayerRequestHandled,
  onUploadRequestHandled,
  selectLayerRequest,
  setWebglError,
  uploadRequest
}: UseEditorSceneRequestsOptions) {
  const handledLayerCommandRequestIdRef = useRef<number | null>(null);
  const handledSelectLayerRequestIdRef = useRef<number | null>(null);
  const handledUploadRequestIdRef = useRef<number | null>(null);

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
