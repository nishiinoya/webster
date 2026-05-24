'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react';
import type { ProjectComment, ProjectCommentEventPayload } from '@webster/shared';
import type {
  DocumentCommand,
  EditorClipboardCommand,
  HistoryStateSnapshot,
  ImageExportBackground,
  ImageExportFormat,
  ImageLayerCommand,
  LayerAssetCommand,
  LayerCommand,
  LayerSummary,
  SelectionCommand,
} from '../app/EditorApp';
import { getCanvasCursorStyle } from './canvas/canvasCursor';
import { useCanvasPointerInput } from './canvas/useCanvasPointerInput';
import { useCanvasWheelZoom } from './canvas/useCanvasWheelZoom';
import { useEditorDocumentTabs } from './hooks/useEditorDocumentTabs';
import { useEditorApp } from './canvas/useEditorApp';
import { useEditorSceneRequests } from './hooks/useEditorSceneRequests';
import type {
  ImageLayerCommandPendingState,
  LayerAssetCommandPendingState,
} from './hooks/useEditorSceneRequests';
import { useProjectFileActions } from './hooks/useProjectFileActions';
import type {
  ProjectFilePendingState,
  SaveStatus,
} from './hooks/useProjectFileActions';
import type {
  SharedProjectRequest,
  SharedProjectUiState,
} from '../collaboration/useCollaboration';
import { useCollaboration } from '../collaboration/useCollaboration';
import type { SharedEditorAction } from '../app/history/SharedEditorAction';
import type { CollaborationPreviewPointer } from '../collaboration/operations';
import { saveUserProjectTemplate } from '../projects/projectTemplates';
import type { WebsterFileHandle } from '../projects/projectFiles';
import type { EditorDocumentTab } from './editorDocuments';
import type { MaskBrushOptions } from '../tools/mask-brush/MaskBrushTypes';
import type { ShapeKind } from '../layers/ShapeLayer';
import type { StrokeStyle } from '../layers/StrokeLayer';
import type { SelectionMode } from '../selection/SelectionManager';
import { cn } from './classNames';
import {
  createProjectComment,
  deleteProjectComment,
  getCurrentUser,
  listProjectComments,
  reopenProjectComment,
  resolveProjectComment,
  updateProjectComment,
} from '../collaboration/sharedProjectApi';

type CanvasViewProps = {
  activeDocument: EditorDocumentTab;
  clipboardCommandRequest: {
    command: EditorClipboardCommand;
    id: number;
  } | null;
  closedDocumentRequest: { id: number; tabId: string } | null;
  collaborationRequest: SharedProjectRequest | null;
  documentCommandRequest: { command: DocumentCommand; id: number } | null;
  historyCommandRequest: { command: 'redo' | 'undo'; id: number } | null;
  imageExportRequest: {
    background: ImageExportBackground;
    format: ImageExportFormat;
    id: number;
    title: string;
  } | null;
  imageDocumentRequest: {
    file: File;
    id: number;
    tabId: string;
  } | null;
  imageLayerCommandRequest: { command: ImageLayerCommand; id: number } | null;
  layerAssetCommandRequest: { command: LayerAssetCommand; id: number } | null;
  layerCommandRequest: { command: LayerCommand; id: number } | null;
  maskBrushOptions: MaskBrushOptions;
  magicSelectionTolerance: number;
  onHistoryChange: (history: HistoryStateSnapshot) => void;
  onCollaborationRequestHandled: (requestId: number) => void;
  onCollaborationStateChange: (state: SharedProjectUiState) => void;
  onClipboardCommandRequestHandled: (requestId: number) => void;
  onHistoryCommandRequestHandled: (requestId: number) => void;
  onFontImported: (fontFamily: string) => void;
  onLayersChange: (layers: LayerSummary[]) => void;
  onOpenObject3DImportFiles: (files: File[]) => void;
  onStrokeLayerCreated: (layerId: string) => void;
  onDocumentCommandRequestHandled: (requestId: number) => void;
  onImageDocumentRequestHandled: (requestId: number) => void;
  onImageLayerCommandRequestHandled: (requestId: number) => void;
  onImageLayerCommandPendingChange: (
    state: ImageLayerCommandPendingState | null,
  ) => void;
  onLayerAssetCommandPendingChange: (
    state: LayerAssetCommandPendingState | null,
  ) => void;
  onLayerAssetCommandRequestHandled: (requestId: number) => void;
  onLayerCommandRequestHandled: (requestId: number) => void;
  onImageExportRequestHandled: (requestId: number) => void;
  onProjectFileRequestHandled: (requestId: number) => void;
  onProjectFilePendingChange: (state: ProjectFilePendingState | null) => void;
  onProjectSaveRequestHandled: (requestId: number) => void;
  onSaveStatusChange: (status: SaveStatus) => void;
  onSelectionCommandRequestHandled: (requestId: number) => void;
  onSelectLayerRequestHandled: (requestId: number) => void;
  onSelectTool: (tool: string) => void;
  onTemplateExportRequestHandled: (requestId: number) => void;
  onTemplateInsertRequestHandled: (requestId: number) => void;
  onTemplateSaveRequestHandled: (requestId: number) => void;
  onUploadRequestHandled: (requestId: number) => void;
  onZoomChange: (zoomPercentage: number) => void;
  onSharedDocumentLoaded: (document: {
    height: number;
    title: string;
    width: number;
  }) => void;
  projectFileRequest: {
    file: File;
    handle?: WebsterFileHandle | null;
    id: number;
    tabId: string;
  } | null;
  projectSaveRequest: { id: number; mode: 'save' | 'save-as' } | null;
  templateExportRequest: { id: number; name: string } | null;
  templateInsertRequest: {
    file: File;
    id: number;
    name: string;
    tabId: string;
  } | null;
  templateSaveRequest: { id: number; name: string } | null;
  selectLayerRequest: { layerIds: string[]; id: number } | null;
  selectionCommandRequest: { command: SelectionCommand; id: number } | null;
  selectedTool: string;
  selectedShape: ShapeKind;
  selectedSelectionMode: SelectionMode;
  selectedStrokeColor: [number, number, number, number];
  selectedStrokeMode: 'draw' | 'erase';
  selectedStrokeStyle: StrokeStyle;
  selectedStrokeTargetLayerId: string | null;
  selectedStrokeTargetMode: 'layer' | 'new' | 'selected';
  selectedStrokeWidth: number;
  uploadRequest: { file: File; id: number } | null;
  showCanvasBorder: boolean;
};

export function CanvasView({
  activeDocument,
  clipboardCommandRequest,
  closedDocumentRequest,
  collaborationRequest,
  documentCommandRequest,
  historyCommandRequest,
  imageExportRequest,
  imageDocumentRequest,
  imageLayerCommandRequest,
  layerAssetCommandRequest,
  layerCommandRequest,
  maskBrushOptions,
  magicSelectionTolerance,
  onHistoryChange,
  onCollaborationRequestHandled,
  onCollaborationStateChange,
  onClipboardCommandRequestHandled,
  onHistoryCommandRequestHandled,
  onFontImported,
  onLayersChange,
  onOpenObject3DImportFiles,
  onStrokeLayerCreated,
  onDocumentCommandRequestHandled,
  onImageDocumentRequestHandled,
  onImageLayerCommandRequestHandled,
  onImageLayerCommandPendingChange,
  onLayerAssetCommandPendingChange,
  onLayerAssetCommandRequestHandled,
  onLayerCommandRequestHandled,
  onImageExportRequestHandled,
  onProjectFileRequestHandled,
  onProjectFilePendingChange,
  onProjectSaveRequestHandled,
  onSaveStatusChange,
  onSelectionCommandRequestHandled,
  onSelectLayerRequestHandled,
  onSelectTool,
  onTemplateExportRequestHandled,
  onTemplateInsertRequestHandled,
  onTemplateSaveRequestHandled,
  onUploadRequestHandled,
  onZoomChange,
  onSharedDocumentLoaded,
  projectFileRequest,
  projectSaveRequest,
  templateExportRequest,
  templateInsertRequest,
  templateSaveRequest,
  selectLayerRequest,
  selectionCommandRequest,
  selectedShape,
  selectedSelectionMode,
  selectedStrokeColor,
  selectedStrokeMode,
  selectedStrokeStyle,
  selectedStrokeTargetLayerId,
  selectedStrokeTargetMode,
  selectedStrokeWidth,
  selectedTool,
  uploadRequest,
  showCanvasBorder,
}: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const collaborationActionHandlerRef = useRef<
    (action: SharedEditorAction) => void
  >(() => undefined);
  const collaborationPreviewHandlerRef = useRef<
    (tool: string, pointer: CollaborationPreviewPointer) => void
  >(() => undefined);
  const handledClipboardCommandRequestIdRef = useRef<number | null>(null);
  const handledTemplateInsertRequestIdRef = useRef<number | null>(null);
  const [fps, setFps] = useState(0);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [pendingComment, setPendingComment] = useState<{
    layerId: string | null;
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [, setCameraRenderTick] = useState(0);
  const handleCameraZoomChange = useCallback(
    (zoom: number) => {
      onZoomChange(zoom);
      setCameraRenderTick((tick) => tick + 1);
    },
    [onZoomChange],
  );
  const { editorAppRef, editorReadyId, setWebglError, webglError } =
    useEditorApp({
      canvasRef,
      maskBrushOptions,
      onHistoryChange,
      onLocalEditorAction: (action) =>
        collaborationActionHandlerRef.current(action),
      onLayersChange,
      onStrokeLayerCreated,
      onZoomChange: handleCameraZoomChange,
      magicSelectionTolerance,
      selectedShape,
      selectedSelectionMode,
      showCanvasBorder,
      selectedStrokeColor,
      selectedStrokeMode,
      selectedStrokeStyle,
      selectedStrokeTargetLayerId,
      selectedStrokeTargetMode,
      selectedStrokeWidth,
      selectedTool,
    });
  const {
    canCommentSharedProject,
    canEditSharedProject,
    currentUserIdRef,
    flushDeferredRemoteOps,
    handleLocalEditorAction,
    saveCurrentSharedProject,
    sendLayerFilterPreview,
    sendPresenceCursor,
    sendPreviewFromCurrentScene,
    state: collaborationState,
  } = useCollaboration({
    activeDocumentTitle: activeDocument.title,
    editorAppRef,
    onCommentEvent: handleCommentEvent,
    onDocumentLoaded: onSharedDocumentLoaded,
    onLayersChange,
    onRequestHandled: onCollaborationRequestHandled,
    onStateChange: onCollaborationStateChange,
    request: collaborationRequest,
  });

  useEffect(() => {
    collaborationActionHandlerRef.current = (action) => {
      void handleLocalEditorAction(action);
    };
    // Stream small, throttled visual previews while the pointer gesture is active.
    collaborationPreviewHandlerRef.current = (tool, pointer) => {
      void sendPreviewFromCurrentScene(tool, pointer);
    };
  }, [handleLocalEditorAction, sendPreviewFromCurrentScene]);

  useEffect(() => {
    const canUseTool =
      canEditSharedProject ||
      selectedTool === 'Pan' ||
      (selectedTool === 'Comment' && canCommentSharedProject);

    if (!canUseTool) {
      onSelectTool('Pan');
    }
  }, [canCommentSharedProject, canEditSharedProject, onSelectTool, selectedTool]);

  const { canvasCursor, pointerHandlers } = useCanvasPointerInput({
    canEditDocument: canEditSharedProject,
    editorAppRef,
    onLayersChange,
    onInteractionEnd: flushDeferredRemoteOps,
    onPresenceCursor: sendPresenceCursor,
    onPreviewEditorAction: (tool, pointer) =>
      collaborationPreviewHandlerRef.current(tool, pointer),
    onTextToolPointerDown: handleTextToolPointerDown,
    selectedTool,
  });
  const { rememberActiveScene } = useEditorDocumentTabs({
    activeDocument,
    closedDocumentRequest,
    editorAppRef,
    editorReadyId,
    onLayersChange,
    onZoomChange,
  });

  useCanvasWheelZoom({ canvasRef, editorAppRef });
  useEditorSceneRequests({
    activeDocumentId: activeDocument.id,
    canEditDocument: canEditSharedProject,
    editorAppRef,
    imageDocumentRequest,
    imageLayerCommandRequest,
    layerAssetCommandRequest,
    layerCommandRequest,
    onLayersChange,
    onFontImported,
    onImageDocumentRequestHandled,
    onImageLayerCommandRequestHandled,
    onImageLayerCommandPendingChange,
    onLayerAssetCommandPendingChange,
    onLayerAssetCommandRequestHandled,
    onLayerCommandRequestHandled,
    onLayerFilterPreview: sendLayerFilterPreview,
    onSceneChange: rememberActiveScene,
    onSelectLayerRequestHandled,
    onUploadRequestHandled,
    selectLayerRequest,
    setWebglError,
    uploadRequest,
  });
  useProjectFileActions({
    editorAppRef,
    activeDocumentId: activeDocument.id,
    activeDocumentTitle: activeDocument.title,
    canEditDocument: canEditSharedProject,
    closedDocumentRequest,
    onLayersChange,
    isSharedProject: collaborationState.mode === 'shared',
    onSaveSharedProject: saveCurrentSharedProject,
    onProjectFileRequestHandled,
    onProjectFilePendingChange,
    onProjectSaveRequestHandled,
    onSaveStatusChange,
    onSceneChange: rememberActiveScene,
    onSelectTool,
    preserveRemoteHistoryChanges: collaborationState.mode === 'shared',
    projectFileRequest,
    projectSaveRequest,
    setWebglError,
  });

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setCurrentUserId(user.id);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const projectId =
      collaborationState.mode === 'shared' ? collaborationState.projectId : null;

    if (!projectId) {
      setComments([]);
      setActiveCommentId(null);
      setPendingComment(null);
      setCommentError(null);
      return;
    }

    setIsLoadingComments(true);
    listProjectComments(projectId)
      .then((response) => {
        if (!cancelled) {
          setComments(response.comments);
          setCommentError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCommentError(error instanceof Error ? error.message : 'Unable to load comments.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingComments(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [collaborationState.mode, collaborationState.projectId]);

  useEffect(() => {
    if (!clipboardCommandRequest || !editorAppRef.current) {
      return;
    }

    if (!canEditSharedProject && clipboardCommandRequest.command !== 'copy') {
      onClipboardCommandRequestHandled(clipboardCommandRequest.id);
      return;
    }

    if (
      handledClipboardCommandRequestIdRef.current === clipboardCommandRequest.id
    ) {
      return;
    }

    handledClipboardCommandRequestIdRef.current = clipboardCommandRequest.id;
    const request = clipboardCommandRequest;
    let didCancel = false;

    async function runClipboardCommand() {
      if (!editorAppRef.current) {
        return;
      }

      try {
        const result =
          request.command === 'copy'
            ? await editorAppRef.current.copySelectedContent()
            : request.command === 'cut'
              ? await editorAppRef.current.cutSelectedContent()
              : await editorAppRef.current.pasteClipboardContent();

        if (!didCancel && result.didChangeScene && editorAppRef.current) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
          rememberActiveScene();
        }

        if (!didCancel && result.didHandle) {
          setWebglError(null);
        }
      } catch (error) {
        if (!didCancel) {
          setWebglError(
            error instanceof Error
              ? error.message
              : 'Clipboard command failed.',
          );
        }
      } finally {
        if (!didCancel) {
          onClipboardCommandRequestHandled(request.id);
        }
      }
    }

    void runClipboardCommand();

    return () => {
      didCancel = true;
    };
  }, [
    clipboardCommandRequest,
    canEditSharedProject,
    editorAppRef,
    onClipboardCommandRequestHandled,
    onLayersChange,
    rememberActiveScene,
    setWebglError,
  ]);

  function handleCommentEvent(
    type: string,
    payload: ProjectCommentEventPayload,
  ) {
    if (payload.projectId !== collaborationState.projectId) {
      return;
    }

    setComments((current) => {
      if (type === 'comment:delete' && payload.commentId) {
        return removeCommentFromTree(current, payload.commentId);
      }

      if (!payload.comment) {
        return current;
      }

      return upsertCommentInTree(current, payload.comment);
    });
  }

  function handleCommentPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.focus();

    if (collaborationState.mode !== 'shared' || !collaborationState.projectId) {
      setCommentError('Upload the project before adding comments.');
      return;
    }

    if (!canCommentSharedProject || !editorAppRef.current) {
      setCommentError('Commenter access is required to add comments.');
      return;
    }

    const point = editorAppRef.current.clientToWorldPoint(event.clientX, event.clientY);
    const hitLayer = editorAppRef.current.hitTestLayerAtClientPoint(
      event.clientX,
      event.clientY,
    );

    setPendingComment({
      layerId: hitLayer?.id ?? null,
      text: '',
      x: point.x,
      y: point.y,
    });
    setActiveCommentId(null);
    setCommentError(null);
  }

  async function submitPendingComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !pendingComment ||
      collaborationState.mode !== 'shared' ||
      !collaborationState.projectId
    ) {
      return;
    }

    const text = pendingComment.text.trim();

    if (!text) {
      return;
    }

    try {
      const comment = await createProjectComment(collaborationState.projectId, {
        content: text,
        layerId: pendingComment.layerId,
        x: pendingComment.x,
        y: pendingComment.y,
      });

      setComments((current) => upsertCommentInTree(current, comment));
      setActiveCommentId(comment.id);
      setPendingComment(null);
      setCommentError(null);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to create comment.');
    }
  }

  async function submitReply(rootComment: ProjectComment) {
    if (collaborationState.mode !== 'shared' || !collaborationState.projectId) {
      return;
    }

    const text = (replyDrafts[rootComment.id] ?? '').trim();

    if (!text) {
      return;
    }

    try {
      const reply = await createProjectComment(collaborationState.projectId, {
        content: text,
        parentCommentId: rootComment.id,
      });

      setComments((current) => upsertCommentInTree(current, reply));
      setReplyDrafts((current) => ({ ...current, [rootComment.id]: '' }));
      setCommentError(null);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to reply.');
    }
  }

  async function updateCommentText(comment: ProjectComment) {
    if (collaborationState.mode !== 'shared' || !collaborationState.projectId) {
      return;
    }

    const text = window.prompt('Edit comment', comment.text);

    if (text === null || !text.trim()) {
      return;
    }

    try {
      const updated = await updateProjectComment(
        collaborationState.projectId,
        comment.id,
        { text: text.trim() },
      );

      setComments((current) => upsertCommentInTree(current, updated));
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to update comment.');
    }
  }

  async function deleteComment(comment: ProjectComment) {
    if (collaborationState.mode !== 'shared' || !collaborationState.projectId) {
      return;
    }

    if (!window.confirm('Delete this comment?')) {
      return;
    }

    try {
      await deleteProjectComment(collaborationState.projectId, comment.id);
      setComments((current) => removeCommentFromTree(current, comment.id));
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to delete comment.');
    }
  }

  async function setCommentResolved(comment: ProjectComment, resolved: boolean) {
    if (collaborationState.mode !== 'shared' || !collaborationState.projectId) {
      return;
    }

    try {
      const updated = resolved
        ? await resolveProjectComment(collaborationState.projectId, comment.id)
        : await reopenProjectComment(collaborationState.projectId, comment.id);

      setComments((current) => upsertCommentInTree(current, updated));
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to update comment.');
    }
  }

  function focusComment(comment: ProjectComment) {
    setActiveCommentId(comment.id);

    if (comment.x !== null && comment.y !== null) {
      editorAppRef.current?.centerCameraOnWorldPoint(comment.x, comment.y);
    }
  }

  useEffect(() => {
    if (!templateSaveRequest || !editorAppRef.current) {
      return;
    }

    if (!canEditSharedProject) {
      onTemplateSaveRequestHandled(templateSaveRequest.id);
      return;
    }

    let didCancel = false;
    const request = templateSaveRequest;

    async function saveTemplate() {
      if (!editorAppRef.current) {
        return;
      }

      onSaveStatusChange('saving');

      try {
        const documentSnapshot = editorAppRef.current.getDocumentSnapshot();
        const projectBlob =
          await editorAppRef.current.exportProjectTemplateFile(request.name);

        await saveUserProjectTemplate({
          height: Math.round(documentSnapshot.height),
          name: request.name,
          projectBlob,
          width: Math.round(documentSnapshot.width),
        });

        if (!didCancel) {
          onSaveStatusChange('saved');
        }
      } catch (error) {
        if (!didCancel) {
          onSaveStatusChange('error');
          setWebglError(
            error instanceof Error ? error.message : 'Unable to save template.',
          );
        }
      } finally {
        if (!didCancel) {
          onTemplateSaveRequestHandled(request.id);
        }
      }
    }

    void saveTemplate();

    return () => {
      didCancel = true;
    };
  }, [
    editorAppRef,
    canEditSharedProject,
    onSaveStatusChange,
    onTemplateSaveRequestHandled,
    setWebglError,
    templateSaveRequest,
  ]);

  useEffect(() => {
    if (!templateInsertRequest || !editorAppRef.current) {
      return;
    }

    if (!canEditSharedProject) {
      onTemplateInsertRequestHandled(templateInsertRequest.id);
      return;
    }

    const request = templateInsertRequest;

    if (
      request.tabId !== activeDocument.id ||
      handledTemplateInsertRequestIdRef.current === request.id
    ) {
      return;
    }

    handledTemplateInsertRequestIdRef.current = request.id;
    let didCancel = false;

    async function insertTemplate() {
      try {
        await editorAppRef.current?.importTemplateAsGroup(
          request.file,
          request.name,
        );

        if (!didCancel && editorAppRef.current) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
          rememberActiveScene();
        }
      } catch (error) {
        if (!didCancel) {
          setWebglError(
            error instanceof Error
              ? error.message
              : 'Unable to insert template.',
          );
        }
      } finally {
        if (!didCancel) {
          onTemplateInsertRequestHandled(request.id);
        }
      }
    }

    void insertTemplate();

    return () => {
      didCancel = true;
    };
  }, [
    editorAppRef,
    activeDocument.id,
    canEditSharedProject,
    onLayersChange,
    onTemplateInsertRequestHandled,
    rememberActiveScene,
    setWebglError,
    templateInsertRequest,
  ]);

  useEffect(() => {
    if (!templateExportRequest || !editorAppRef.current) {
      return;
    }

    let didCancel = false;
    const request = templateExportRequest;

    async function exportTemplate() {
      if (!editorAppRef.current) {
        return;
      }

      onSaveStatusChange('saving');

      try {
        const projectBlob =
          await editorAppRef.current.exportProjectTemplateFile(request.name);

        if (!didCancel) {
          downloadBlob(projectBlob, getProjectExportFilename(request.name));
          onSaveStatusChange('saved');
        }
      } catch (error) {
        if (!didCancel) {
          onSaveStatusChange('error');
          setWebglError(
            error instanceof Error
              ? error.message
              : 'Unable to export template.',
          );
        }
      } finally {
        if (!didCancel) {
          onTemplateExportRequestHandled(request.id);
        }
      }
    }

    void exportTemplate();

    return () => {
      didCancel = true;
    };
  }, [
    editorAppRef,
    onSaveStatusChange,
    onTemplateExportRequestHandled,
    setWebglError,
    templateExportRequest,
  ]);

  useEffect(() => {
    if (!historyCommandRequest || !editorAppRef.current) {
      return;
    }

    if (!canEditSharedProject) {
      onHistoryCommandRequestHandled(historyCommandRequest.id);
      return;
    }

    const preserveRemoteChanges = collaborationState.mode === 'shared';
    const historyState = editorAppRef.current.getHistoryState();
    const couldNavigate =
      historyCommandRequest.command === 'undo'
        ? historyState.canUndo
        : historyState.canRedo;
    const didApply =
      historyCommandRequest.command === 'undo'
        ? editorAppRef.current.undo({ preserveRemoteChanges })
        : editorAppRef.current.redo({ preserveRemoteChanges });

    if (didApply) {
      onLayersChange(editorAppRef.current.getLayerSummaries());
      onZoomChange(
        Math.round(editorAppRef.current.getCameraSnapshot().zoom * 100),
      );
      rememberActiveScene();
      setWebglError(null);
    } else if (couldNavigate && preserveRemoteChanges) {
      setWebglError(
        historyCommandRequest.command === 'undo'
          ? 'Undo was skipped because that edit overlaps with newer shared changes.'
          : 'Redo was skipped because that edit overlaps with newer shared changes.',
      );
    }

    onHistoryCommandRequestHandled(historyCommandRequest.id);
  }, [
    collaborationState.mode,
    editorAppRef,
    canEditSharedProject,
    historyCommandRequest,
    onHistoryCommandRequestHandled,
    onLayersChange,
    onZoomChange,
    rememberActiveScene,
    setWebglError,
  ]);

  useEffect(() => {
    if (!documentCommandRequest || !editorAppRef.current) {
      return;
    }

    if (!canEditSharedProject) {
      onDocumentCommandRequestHandled(documentCommandRequest.id);
      return;
    }

    editorAppRef.current.applyDocumentCommand(documentCommandRequest.command);
    onDocumentCommandRequestHandled(documentCommandRequest.id);
    onLayersChange(editorAppRef.current.getLayerSummaries());
    rememberActiveScene();
  }, [
    documentCommandRequest,
    editorAppRef,
    canEditSharedProject,
    onDocumentCommandRequestHandled,
    onLayersChange,
    rememberActiveScene,
  ]);

  function handleTextToolPointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (!canEditSharedProject || event.button !== 0 || !editorAppRef.current) {
      return false;
    }

    editorAppRef.current.startTextEditAtClientPoint(
      event.clientX,
      event.clientY,
    );
    onLayersChange(editorAppRef.current.getLayerSummaries());

    return true;
  }

  function handleCanvasDragOver(event: ReactDragEvent<HTMLCanvasElement>) {
    if (!canEditSharedProject) {
      return;
    }

    if (!hasDroppableAsset(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleCanvasDrop(event: ReactDragEvent<HTMLCanvasElement>) {
    if (
      !canEditSharedProject ||
      !editorAppRef.current ||
      !hasDroppableAsset(event.dataTransfer)
    ) {
      return;
    }

    event.preventDefault();
    const dropPoint = { clientX: event.clientX, clientY: event.clientY };
    const files = Array.from(event.dataTransfer.files).filter(
      isDroppableAssetFile,
    );

    if (files.length === 0) {
      return;
    }

    if (files.some(isModelAssetFile)) {
      onOpenObject3DImportFiles(files);
      return;
    }

    async function importFiles() {
      try {
        await editorAppRef.current?.importDroppedFiles(
          files,
          dropPoint.clientX,
          dropPoint.clientY,
        );

        if (editorAppRef.current) {
          onLayersChange(editorAppRef.current.getLayerSummaries());
          rememberActiveScene();
          setWebglError(null);
        }
      } catch (error) {
        setWebglError(
          error instanceof Error
            ? error.message
            : 'Unable to import dropped file.',
        );
      }
    }

    void importFiles();
  }

  async function handleTextKeyDown(
    event: ReactKeyboardEvent<HTMLCanvasElement>,
  ) {
    if (
      !canEditSharedProject ||
      selectedTool !== 'Text' ||
      !editorAppRef.current
    ) {
      return;
    }

    let didEdit = false;
    const isShortcut = event.ctrlKey || event.metaKey;
    const shortcutKey = event.key.toLowerCase();

    if (
      isShortcut &&
      (shortcutKey === 'a' || shortcutKey === 'c' || shortcutKey === 'v')
    ) {
      event.preventDefault();
    }

    if (isShortcut && shortcutKey === 'a') {
      didEdit = editorAppRef.current.selectAllTextInput();
    } else if (isShortcut && shortcutKey === 'c') {
      const selectedText = editorAppRef.current.getSelectedTextInput();

      if (selectedText !== null) {
        await writeClipboardText(selectedText);
        didEdit = true;
      }
    } else if (isShortcut && shortcutKey === 'v') {
      const pastedText = await readClipboardText();

      if (pastedText) {
        didEdit = editorAppRef.current.insertTextInput(pastedText);
      }
    } else if (event.key === 'Escape') {
      editorAppRef.current.finishTextEdit();
      didEdit = true;
    } else if (event.key === 'Backspace') {
      didEdit = editorAppRef.current.deleteTextBackward();
    } else if (event.key === 'Delete') {
      didEdit = editorAppRef.current.deleteTextForward();
    } else if (event.key === 'ArrowLeft') {
      didEdit = editorAppRef.current.moveTextCaret('left');
    } else if (event.key === 'ArrowRight') {
      didEdit = editorAppRef.current.moveTextCaret('right');
    } else if (event.key === 'Home') {
      didEdit = editorAppRef.current.moveTextCaret('home');
    } else if (event.key === 'End') {
      didEdit = editorAppRef.current.moveTextCaret('end');
    } else if (event.key === 'Enter') {
      didEdit = editorAppRef.current.insertTextInput('\n');
    } else if (
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      event.key.length === 1
    ) {
      didEdit = editorAppRef.current.insertTextInput(event.key);
    }

    if (!didEdit) {
      return;
    }

    onLayersChange(editorAppRef.current.getLayerSummaries());
  }

  useEffect(() => {
    let animationFrameId = 0;
    let lastTime = performance.now();
    let frameCount = 0;
    let accumulatedTime = 0;

    const updateFps = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;

      frameCount += 1;
      accumulatedTime += delta;

      if (accumulatedTime >= 500) {
        setFps(Math.round((frameCount * 1000) / accumulatedTime));
        frameCount = 0;
        accumulatedTime = 0;
      }

      animationFrameId = requestAnimationFrame(updateFps);
    };

    animationFrameId = requestAnimationFrame(updateFps);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    if (!imageExportRequest || !editorAppRef.current) {
      return;
    }

    let didCancel = false;

    editorAppRef.current
      .exportImageFile(imageExportRequest.format, imageExportRequest.background)
      .then((blob) => {
        if (!didCancel) {
          downloadBlob(
            blob,
            getImageExportFilename(
              imageExportRequest.title,
              imageExportRequest.format,
            ),
          );
        }
      })
      .catch((error) => {
        if (!didCancel) {
          setWebglError(
            error instanceof Error ? error.message : 'Unable to export image.',
          );
        }
      })
      .finally(() => {
        if (!didCancel) {
          onImageExportRequestHandled(imageExportRequest.id);
        }
      });

    return () => {
      didCancel = true;
    };
  }, [
    editorAppRef,
    imageExportRequest,
    onImageExportRequestHandled,
    setWebglError,
  ]);

  useEffect(() => {
    if (!selectionCommandRequest || !editorAppRef.current) {
      return;
    }

    if (!canEditSharedProject) {
      onSelectionCommandRequestHandled(selectionCommandRequest.id);
      return;
    }

    const didApply = editorAppRef.current.applySelectionCommand(
      selectionCommandRequest.command,
    );

    if (didApply) {
      onLayersChange(editorAppRef.current.getLayerSummaries());
      rememberActiveScene();
    }

    onSelectionCommandRequestHandled(selectionCommandRequest.id);
  }, [
    editorAppRef,
    canEditSharedProject,
    onLayersChange,
    rememberActiveScene,
    onSelectionCommandRequestHandled,
    selectionCommandRequest,
  ]);

  const canvasPointerHandlers = {
    ...pointerHandlers,
    onPointerDown:
      selectedTool === 'Comment'
        ? handleCommentPointerDown
        : pointerHandlers.onPointerDown,
  };
  const openComments = comments.filter((comment) => comment.status === 'open');
  const resolvedComments = comments.filter(
    (comment) => comment.status === 'resolved',
  );
  const activeComment =
    activeCommentId ? findCommentById(comments, activeCommentId) : null;

  return (
    <section
      className='relative min-h-0 min-w-0 overflow-hidden bg-[#101113] bg-[length:32px_32px]'
      aria-label='Main canvas'
    >
      <div
        className='absolute left-7 right-0 top-0 z-[1] h-7 border-b border-[#2a2d31] bg-[#17191d] hidden'
        aria-hidden='true'
      />
      <div
        className='absolute bottom-0 left-0 top-0 z-[1] w-7 border-r border-[#2a2d31] bg-[#17191d] hidden'
        aria-hidden='true'
      />
      <div className='relative grid min-h-full p-0'>
        <div className='relative min-h-0 min-w-0'>
          <div className='absolute inset-0 grid overflow-hidden bg-transparent'>
            <canvas
              ref={canvasRef}
              aria-label='WebGL editor canvas'
              className={cn(
                'block h-full w-full touch-none cursor-crosshair',
                selectedTool === 'Pan' && 'cursor-grab',
              )}
              onKeyDown={handleTextKeyDown}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
              tabIndex={0}
              style={{ cursor: getCanvasCursorStyle(canvasCursor) }}
              {...canvasPointerHandlers}
            />
            {webglError ? (
              <p className='absolute inset-4 m-0 grid place-items-center rounded-lg border border-[#b96a6a] bg-[rgba(28,20,20,0.94)] text-center text-[13px] font-bold text-[#ffd0d0]'>
                {webglError}
              </p>
            ) : null}
            {collaborationState.mode === 'shared'
              ? collaborationState.users
                  .filter((u) => u.cursor != null && u.user.id !== currentUserIdRef.current)
                  .map((u) => {
                    const screen = editorAppRef.current?.worldToCanvasPoint(u.cursor!.x, u.cursor!.y);
                    const x = screen?.x ?? 0;
                    const y = screen?.y ?? 0;
                    const color = userIdToColor(u.user.id);
                    return (
                      <div
                        key={u.user.id}
                        className='pointer-events-none absolute z-[3]'
                        style={{
                          left: x,
                          top: y,
                          transition: 'left 80ms linear, top 80ms linear',
                        }}
                      >
                        <svg width='16' height='20' viewBox='0 0 16 20' fill='none'>
                          <path
                            d='M0 0L0 14L4 10L6.5 16L8.5 15L6 9L11 9Z'
                            fill={color}
                            stroke='#17191d'
                            strokeWidth='1.2'
                          />
                        </svg>
                        <span
                          className='absolute left-4 top-3 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold text-white'
                          style={{ backgroundColor: color }}
                        >
                          {u.user.displayName}
                        </span>
                      </div>
                    );
                  })
              : null}
            {collaborationState.mode === 'shared'
              ? openComments
                  .filter((comment) => comment.x !== null && comment.y !== null)
                  .map((comment) => {
                    const screen = editorAppRef.current?.worldToCanvasPoint(
                      comment.x ?? 0,
                      comment.y ?? 0,
                    );

                    return (
                      <button
                        aria-label={`Open comment by ${comment.author.displayName || comment.author.email}`}
                        className={cn(
                          'absolute z-[4] grid h-7 w-7 -translate-x-1/2 -translate-y-full place-items-center rounded-full border-2 border-[#101113] bg-[#f2b84b] text-[12px] font-extrabold text-[#101113] shadow-[0_8px_18px_rgba(0,0,0,0.32)] hover:bg-[#ffd37a]',
                          activeCommentId === comment.id && 'bg-[#7ee0c7]',
                        )}
                        key={comment.id}
                        onClick={() => focusComment(comment)}
                        style={{
                          left: screen?.x ?? 0,
                          top: screen?.y ?? 0,
                        }}
                        type="button"
                      >
                        {comment.replies?.length ? comment.replies.length + 1 : 1}
                      </button>
                    );
                  })
              : null}
            {pendingComment ? (
              <form
                className="absolute z-[5] grid w-[min(280px,calc(100%-24px))] gap-2 rounded-lg border border-[#3b424b] bg-[#17191d] p-3 shadow-[0_18px_36px_rgba(0,0,0,0.4)]"
                onSubmit={submitPendingComment}
                style={{
                  left: Math.min(
                    (editorAppRef.current?.worldToCanvasPoint(pendingComment.x, pendingComment.y).x ?? 12) + 12,
                    9999,
                  ),
                  top:
                    (editorAppRef.current?.worldToCanvasPoint(pendingComment.x, pendingComment.y).y ?? 12) +
                    12,
                }}
              >
                <textarea
                  autoFocus
                  className="min-h-[86px] resize-none rounded-md border border-[#30353d] bg-[#101113] p-2 text-[13px] font-bold text-[#eef1f4]"
                  onChange={(event) =>
                    setPendingComment((current) =>
                      current ? { ...current, text: event.target.value } : current,
                    )
                  }
                  placeholder="Add a comment"
                  value={pendingComment.text}
                />
                <div className="flex justify-end gap-2">
                  <button
                    className={commentButtonClass}
                    onClick={() => setPendingComment(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className={commentPrimaryButtonClass} type="submit">
                    Comment
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          <p className='pointer-events-none absolute left-1/2 top-12 z-[2] m-0 -translate-x-1/2 rounded-lg border border-white/10 bg-[rgba(23,25,29,0.9)] px-3 py-2 text-[13px] font-bold text-[#eef1f4]'>
            {activeDocument.title}
          </p>
          {collaborationState.mode === 'shared' ? (
            <CommentPanel
              activeComment={activeComment}
              canComment={canCommentSharedProject}
              canModerate={collaborationState.role === 'owner' || collaborationState.role === 'editor'}
              commentError={commentError}
              currentUserId={currentUserId}
              isLoading={isLoadingComments}
              onDelete={deleteComment}
              onEdit={updateCommentText}
              onFocus={focusComment}
              onReply={submitReply}
              onResolve={(comment) => setCommentResolved(comment, true)}
              onReopen={(comment) => setCommentResolved(comment, false)}
              openComments={openComments}
              replyDrafts={replyDrafts}
              resolvedComments={resolvedComments}
              setReplyDrafts={setReplyDrafts}
            />
          ) : null}
          <p className='pointer-events-none absolute bottom-[18px] right-[18px] z-[2] m-0 rounded-lg border border-white/10 bg-[rgba(23,25,29,0.9)] px-3 py-2 text-[13px] font-semibold text-[#eef1f4]'>
            Workspace - {selectedTool} tool selected
          </p>
          <p className='pointer-events-none absolute bottom-[58px] right-[18px] z-[2] m-0 rounded-lg border border-white/10 bg-[rgba(23,25,29,0.9)] px-3 py-2 text-[13px] font-semibold text-[#eef1f4]'>
            FPS - {fps}
          </p>
        </div>
      </div>
    </section>
  );
}

const CURSOR_COLORS = [
  '#4aa391', '#e05c5c', '#e0a85c', '#5c8be0', '#b05ce0',
  '#5ce08b', '#e05ca8', '#5cd4e0', '#e0d45c', '#a05ce0',
];

function userIdToColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readClipboardText() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

async function writeClipboardText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Some browsers block clipboard writes outside secure contexts.
  }
}

function getImageExportFilename(title: string, format: ImageExportFormat) {
  const extension = format === 'jpeg' ? 'jpg' : format;
  const safeTitle = (title.trim() || 'untitled').replace(
    /[<>:"/\\|?*\u0000-\u001f]/g,
    '-',
  );
  const withoutImageExtension = safeTitle.replace(/\.(pdf|png|jpe?g)$/i, '');

  return `${withoutImageExtension}.${extension}`;
}

function getProjectExportFilename(title: string) {
  const safeTitle = (title.trim() || 'template').replace(
    /[<>:"/\\|?*\u0000-\u001f]/g,
    '-',
  );

  return safeTitle.toLowerCase().endsWith('.webster')
    ? safeTitle
    : `${safeTitle}.webster`;
}

function hasDroppableAsset(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.items).some((item) => item.kind === 'file');
}

function isDroppableAssetFile(file: File) {
  return file.type.startsWith('image/') || isModelAssetFile(file);
}

function isModelAssetFile(file: File) {
  return /\.(obj|mtl|zip|glb|gltf|bin|stl|ply|fbx|dae|3ds)$/iu.test(file.name);
}

function CommentPanel({
  activeComment,
  canComment,
  canModerate,
  commentError,
  currentUserId,
  isLoading,
  onDelete,
  onEdit,
  onFocus,
  onReply,
  onResolve,
  onReopen,
  openComments,
  replyDrafts,
  resolvedComments,
  setReplyDrafts,
}: {
  activeComment: ProjectComment | null;
  canComment: boolean;
  canModerate: boolean;
  commentError: string | null;
  currentUserId: string | null;
  isLoading: boolean;
  onDelete: (comment: ProjectComment) => void;
  onEdit: (comment: ProjectComment) => void;
  onFocus: (comment: ProjectComment) => void;
  onReply: (comment: ProjectComment) => void;
  onResolve: (comment: ProjectComment) => void;
  onReopen: (comment: ProjectComment) => void;
  openComments: ProjectComment[];
  replyDrafts: Record<string, string>;
  resolvedComments: ProjectComment[];
  setReplyDrafts: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  return (
    <aside className="absolute bottom-[96px] right-3 top-3 z-[4] grid w-[min(340px,calc(100%-24px))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-[#30353d] bg-[rgba(23,25,29,0.95)] shadow-[0_18px_36px_rgba(0,0,0,0.36)]">
      <div className="border-b border-[#30353d] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-[13px] font-extrabold uppercase text-[#dce1e6]">
            Comments
          </h2>
          <span className="text-[11px] font-extrabold text-[#8b929b]">
            {openComments.length} open
          </span>
        </div>
        {commentError ? (
          <p className="m-0 mt-1 text-[12px] font-bold text-[#ffd0d0]">{commentError}</p>
        ) : null}
      </div>
      <div className="min-h-0 overflow-auto p-2">
        {isLoading ? (
          <p className={commentMutedClass}>Loading...</p>
        ) : openComments.length === 0 ? (
          <p className={commentMutedClass}>No open comments.</p>
        ) : (
          <div className="grid gap-2">
            {openComments.map((comment) => (
              <CommentThread
                canComment={canComment}
                canModerate={canModerate}
                comment={comment}
                currentUserId={currentUserId}
                isActive={activeComment?.id === comment.id}
                key={comment.id}
                onDelete={onDelete}
                onEdit={onEdit}
                onFocus={onFocus}
                onReply={onReply}
                onResolve={onResolve}
                replyDraft={replyDrafts[comment.id] ?? ''}
                setReplyDraft={(value) =>
                  setReplyDrafts((current) => ({ ...current, [comment.id]: value }))
                }
              />
            ))}
          </div>
        )}
        <details className="mt-2 rounded-md border border-[#30353d] bg-[#17191d]">
          <summary className="cursor-default px-3 py-2 text-[12px] font-extrabold uppercase text-[#8b929b]">
            Resolved ({resolvedComments.length})
          </summary>
          <div className="grid gap-2 border-t border-[#30353d] p-2">
            {resolvedComments.length === 0 ? (
              <p className={commentMutedClass}>No resolved comments.</p>
            ) : (
              resolvedComments.map((comment) => (
                <CommentThread
                  canComment={false}
                  canModerate={canModerate}
                  comment={comment}
                  currentUserId={currentUserId}
                  isActive={activeComment?.id === comment.id}
                  key={comment.id}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onFocus={onFocus}
                  onReopen={onReopen}
                  replyDraft=""
                  setReplyDraft={() => undefined}
                />
              ))
            )}
          </div>
        </details>
      </div>
    </aside>
  );
}

function CommentThread({
  canComment,
  canModerate,
  comment,
  currentUserId,
  isActive,
  onDelete,
  onEdit,
  onFocus,
  onReply,
  onResolve,
  onReopen,
  replyDraft,
  setReplyDraft,
}: {
  canComment: boolean;
  canModerate: boolean;
  comment: ProjectComment;
  currentUserId: string | null;
  isActive: boolean;
  onDelete: (comment: ProjectComment) => void;
  onEdit: (comment: ProjectComment) => void;
  onFocus: (comment: ProjectComment) => void;
  onReply?: (comment: ProjectComment) => void;
  onResolve?: (comment: ProjectComment) => void;
  onReopen?: (comment: ProjectComment) => void;
  replyDraft: string;
  setReplyDraft: (value: string) => void;
}) {
  const isAuthor = currentUserId === comment.authorUserId;
  const canUpdateStatus = canModerate || isAuthor;
  const canDeleteComment = canModerate || (isAuthor && comment.status === 'open');

  return (
    <article
      className={cn(
        'grid gap-2 rounded-md border border-[#30353d] bg-[#202329] p-2.5',
        isActive && 'border-[#4aa391] bg-[#203731]',
      )}
    >
      <button
        className="grid gap-1 text-left"
        onClick={() => onFocus(comment)}
        type="button"
      >
        <span className="flex items-center justify-between gap-2">
          <strong className="truncate text-[12px] text-[#eef1f4]">
            {comment.author.displayName || comment.author.email}
          </strong>
          <span className="text-[10px] font-bold uppercase text-[#8b929b]">
            {comment.layerId ? 'Layer' : 'Project'}
          </span>
        </span>
        <span className="whitespace-pre-wrap text-[13px] font-semibold leading-5 text-[#dce1e6]">
          {comment.text}
        </span>
      </button>
      {comment.replies && comment.replies.length > 0 ? (
        <div className="grid gap-1 border-l border-[#3b424b] pl-2">
          {comment.replies.map((reply) => (
            <div className="grid gap-0.5" key={reply.id}>
              <span className="text-[11px] font-bold text-[#9aa1ab]">
                {reply.author.displayName || reply.author.email}
              </span>
              <span className="whitespace-pre-wrap text-[12px] font-semibold leading-5 text-[#dce1e6]">
                {reply.text}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {isAuthor && comment.status === 'open' ? (
          <>
            <button className={commentTinyButtonClass} onClick={() => onEdit(comment)} type="button">
              Edit
            </button>
          </>
        ) : null}
        {canDeleteComment ? (
          <button className={commentTinyButtonClass} onClick={() => onDelete(comment)} type="button">
            Delete
          </button>
        ) : null}
        {comment.status === 'open' && onResolve && canUpdateStatus ? (
          <button className={commentTinyButtonClass} onClick={() => onResolve(comment)} type="button">
            Resolve
          </button>
        ) : null}
        {comment.status === 'resolved' && onReopen && canUpdateStatus ? (
          <button className={commentTinyButtonClass} onClick={() => onReopen(comment)} type="button">
            Reopen
          </button>
        ) : null}
      </div>
      {canComment && comment.status === 'open' && onReply ? (
        <form
          className="grid gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            onReply(comment);
          }}
        >
          <textarea
            className="min-h-[58px] resize-none rounded-md border border-[#30353d] bg-[#101113] p-2 text-[12px] font-semibold text-[#eef1f4]"
            onChange={(event) => setReplyDraft(event.target.value)}
            placeholder="Reply"
            value={replyDraft}
          />
          <button className={commentPrimaryButtonClass} type="submit">
            Reply
          </button>
        </form>
      ) : null}
    </article>
  );
}

function upsertCommentInTree(comments: ProjectComment[], comment: ProjectComment) {
  if (comment.parentCommentId) {
    return comments.map((root) =>
      root.id === comment.parentCommentId
        ? { ...root, replies: upsertById(root.replies ?? [], comment) }
        : root,
    );
  }

  const existing = comments.find((root) => root.id === comment.id);
  const nextComment = existing
    ? { ...comment, replies: comment.replies?.length ? comment.replies : existing.replies }
    : comment;

  return upsertById(comments, nextComment);
}

function removeCommentFromTree(comments: ProjectComment[], commentId: string) {
  return comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) => ({
      ...comment,
      replies: (comment.replies ?? []).filter((reply) => reply.id !== commentId),
    }));
}

function findCommentById(comments: ProjectComment[], commentId: string): ProjectComment | null {
  for (const comment of comments) {
    if (comment.id === commentId) {
      return comment;
    }

    const reply = (comment.replies ?? []).find((candidate) => candidate.id === commentId);

    if (reply) {
      return reply;
    }
  }

  return null;
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const index = items.findIndex((item) => item.id === nextItem.id);

  if (index < 0) {
    return [...items, nextItem];
  }

  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

const commentMutedClass =
  'm-0 rounded-md border border-[#30353d] bg-[#17191d] p-2.5 text-[12px] font-bold text-[#8b929b]';

const commentButtonClass =
  'rounded-md border border-[#333941] bg-[#202329] px-2.5 py-1.5 text-[12px] font-bold text-[#dce1e6] hover:border-[#4c535c] hover:bg-[#252930]';

const commentPrimaryButtonClass =
  'rounded-md border border-[#4aa391] bg-[#203731] px-2.5 py-1.5 text-[12px] font-bold text-[#eef1f4] hover:bg-[#25453e]';

const commentTinyButtonClass =
  'rounded-md border border-[#333941] bg-[#171a1f] px-2 py-1 text-[11px] font-bold text-[#cfd4da] hover:border-[#4aa391] hover:bg-[#203731]';
