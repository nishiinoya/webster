'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
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
import { saveUserProjectTemplate } from '../projects/projectTemplates';
import type { WebsterFileHandle } from '../projects/projectFiles';
import type { EditorDocumentTab } from './editorDocuments';
import type { MaskBrushOptions } from '../tools/mask-brush/MaskBrushTypes';
import type { ShapeKind } from '../layers/ShapeLayer';
import type { StrokeStyle } from '../layers/StrokeLayer';
import type { SelectionMode } from '../selection/SelectionManager';
import { cn } from './classNames';

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
  const collaborationPreviewHandlerRef = useRef<(tool: string) => void>(
    () => undefined,
  );
  const handledClipboardCommandRequestIdRef = useRef<number | null>(null);
  const handledTemplateInsertRequestIdRef = useRef<number | null>(null);
  const [fps, setFps] = useState(0);
  const { editorAppRef, editorReadyId, setWebglError, webglError } =
    useEditorApp({
      canvasRef,
      maskBrushOptions,
      onHistoryChange,
      onLocalEditorAction: (action) =>
        collaborationActionHandlerRef.current(action),
      onLayersChange,
      onStrokeLayerCreated,
      onZoomChange,
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
    canEditSharedProject,
    currentUserIdRef,
    handleLocalEditorAction,
    sendPresenceCursor,
    sendPreviewFromCurrentScene,
    state: collaborationState,
  } = useCollaboration({
    activeDocumentTitle: activeDocument.title,
    editorAppRef,
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
    collaborationPreviewHandlerRef.current = (tool) => {
      void sendPreviewFromCurrentScene(tool);
    };
  }, [handleLocalEditorAction, sendPreviewFromCurrentScene]);

  useEffect(() => {
    if (!canEditSharedProject && selectedTool !== 'Pan') {
      onSelectTool('Pan');
    }
  }, [canEditSharedProject, onSelectTool, selectedTool]);

  const { canvasCursor, pointerHandlers } = useCanvasPointerInput({
    canEditDocument: canEditSharedProject,
    editorAppRef,
    onLayersChange,
    onPresenceCursor: sendPresenceCursor,
    onPreviewEditorAction: (tool) =>
      collaborationPreviewHandlerRef.current(tool),
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
    onProjectFileRequestHandled,
    onProjectFilePendingChange,
    onProjectSaveRequestHandled,
    onSaveStatusChange,
    onSceneChange: rememberActiveScene,
    onSelectTool,
    projectFileRequest,
    projectSaveRequest,
    setWebglError,
  });

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

    const didApply =
      historyCommandRequest.command === 'undo'
        ? editorAppRef.current.undo()
        : editorAppRef.current.redo();

    if (didApply) {
      onLayersChange(editorAppRef.current.getLayerSummaries());
      onZoomChange(
        Math.round(editorAppRef.current.getCameraSnapshot().zoom * 100),
      );
      rememberActiveScene();
    }

    onHistoryCommandRequestHandled(historyCommandRequest.id);
  }, [
    editorAppRef,
    canEditSharedProject,
    historyCommandRequest,
    onHistoryCommandRequestHandled,
    onLayersChange,
    onZoomChange,
    rememberActiveScene,
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
              {...pointerHandlers}
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
                    const canvasRect = canvasRef.current?.getBoundingClientRect();
                    const x = u.cursor!.x * (canvasRect?.width ?? 0);
                    const y = u.cursor!.y * (canvasRect?.height ?? 0);
                    const color = userIdToColor(u.user.id);
                    return (
                      <div
                        key={u.user.id}
                        className='pointer-events-none absolute z-[3]'
                        style={{ left: x, top: y }}
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
          </div>
          <p className='pointer-events-none absolute left-1/2 top-12 z-[2] m-0 -translate-x-1/2 rounded-lg border border-white/10 bg-[rgba(23,25,29,0.9)] px-3 py-2 text-[13px] font-bold text-[#eef1f4]'>
            {activeDocument.title}
          </p>
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
