'use client';

import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { MessageCircle } from 'lucide-react';
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
} from '@/editor/app/EditorApp';
import type { Imported3DModel } from '../import3d/Imported3DModel';
import type { MaskBrushOptions } from '../tools/mask-brush/MaskBrushTypes';
import type { ShapeKind } from '../layers/ShapeLayer';
import type { StrokeStyle } from '../layers/StrokeLayer';
import type { Object3DKind } from '../layers/Layer';
import type { SelectionMode } from '../selection/SelectionManager';
import {
  canPickProjectFileHandle,
  pickProjectFileWithHandle,
} from '../projects/projectFiles';
import type { WebsterFileHandle } from '../projects/projectFiles';
import {
  readRememberedProjectFileHandle,
} from '../projects/projectFileHandleStore';
import {
  builtInProjectTemplates,
  deleteUserProjectTemplate,
  getUserProjectTemplate,
  importUserProjectTemplate,
  listUserProjectTemplates,
  renameUserProjectTemplate,
} from '../projects/projectTemplates';
import type { UserProjectTemplateSummary } from '../projects/projectTemplates';
import type {
  ProjectFilePendingState,
  SaveStatus,
} from './hooks/useProjectFileActions';
import { CanvasView } from './CanvasView';
import { cn } from './classNames';
import type { EditorDocumentTab, NewDocumentSize } from './editorDocuments';
import type {
  ImageLayerCommandPendingState,
  LayerAssetCommandPendingState,
} from './hooks/useEditorSceneRequests';
import { HistoryPanel } from './panels/HistoryPanel';
import { LayersPanel } from './panels/LayersPanel';
import { VersionHistoryPanel } from './panels/VersionHistoryPanel';
import { ExportImageDialog } from './dialogs/ExportImageDialog';
import { NewDocumentDialog } from './dialogs/NewDocumentDialog';
import { ShareProjectDialog } from './dialogs/ShareProjectDialog';
import { HomeProjects } from './HomeProjects';
import { recordOpenedProject } from '../projects/recentSharedProjects';
import { Object3DImportDialog } from './dialogs/Object3DImportDialog';
import { ResizeCanvasDialog } from './dialogs/ResizeCanvasDialog';
import { ResizeImageDialog } from './dialogs/ResizeImageDialog';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { TabsBar } from './toolbar/TabsBar';
import { Toolbar } from './toolbar/Toolbar';
import { ToolsPanel } from './toolbar/ToolsPanel';
import type { ToolDefinition } from './toolbar/ToolsPanel';
import type {
  SharedProjectRequest,
  SharedProjectUiState,
} from '../collaboration/useCollaboration';
import { acceptProjectInvite } from '../collaboration/sharedProjectApi';
import { useSubscription } from '../collaboration/useSubscription';

const initialTabs: EditorDocumentTab[] = [];

const editorTools: ToolDefinition[] = [
  {
    description: 'Pick and move layers only.',
    icon: '/icons/move-icon.svg',
    label: 'Move',
    value: 'Move',
  },
  {
    description: 'Resize and rotate the selected layer.',
    icon: '/icons/cut-icon.svg',
    label: 'Transform',
    value: 'Transform',
  },
  {
    description: 'Cut layer bounds with crop handles.',
    icon: 'C',
    label: 'Crop',
    value: 'Crop',
  },
  {
    description: 'Drag the workspace without editing artwork.',
    icon: '/icons/hand-icon.svg',
    label: 'Pan',
    value: 'Pan',
  },
  {
    description: 'Place review pins and discuss the project.',
    icon: <MessageCircle size={22} strokeWidth={2.2} />,
    label: 'Comment',
    value: 'Comment',
  },
  {
    description: 'Paint the selected layer mask.',
    icon: 'B',
    label: 'Mask Brush',
    value: 'Mask Brush',
  },
  {
    description: 'Click the canvas to place and edit live text.',
    icon: '/icons/text-icon.svg',
    label: 'Text',
    value: 'Text',
  },
  {
    description: 'Sketch freehand strokes with pencils and brushes.',
    icon: '/icons/brush-icon.svg',
    label: 'Draw',
    value: 'Draw',
  },
  {
    description: 'Draw rectangles, circles, arrows, and custom shapes.',
    icon: '/icons/cube-geometry-shape-icon.svg',
    label: 'Shape',
    value: 'Shape',
  },
  {
    description: 'Drag a box selection.',
    icon: '/icons/select-icon.svg',
    label: 'Rectangle Select',
    value: 'Rectangle Select',
  },
  {
    description: 'Drag an oval selection.',
    icon: 'E',
    label: 'Ellipse Select',
    value: 'Ellipse Select',
  },
  {
    description: 'Draw a freehand selection.',
    icon: '/icons/lasso-icon.svg',
    label: 'Lasso Select',
    value: 'Lasso Select',
  },
  {
    description: 'Pick similar image colors.',
    icon: '/icons/magic-wand-icon.svg',
    label: 'Magic Select',
    value: 'Magic Select',
  },
];

const initialLayers: LayerSummary[] = [];
const documentPresets: Array<NewDocumentSize & { label: string }> =
  builtInProjectTemplates.map((template) => ({
    height: template.height,
    label: `${template.name} ${template.width} x ${template.height}`,
    width: template.width,
  }));
const layersPanelMinHeight = 170;
const propertiesPanelMinHeight = 260;
const historyPanelMinHeight = 72;
const sidePanelHandleHeight = 12;
const collapsedSidePanelHeight = 42;

type SidePanelId = 'history' | 'layers' | 'properties' | 'versions';

type EditorLayoutVars = CSSProperties & {
  '--tools-panel-width': string;
  '--right-panel-width': string;
  '--layers-panel-height': string;
  '--properties-panel-height': string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const emptyHistoryState: HistoryStateSnapshot = {
  canRedo: false,
  canUndo: false,
  entries: [],
  redoLabel: null,
  undoLabel: null,
};

const initialSharedProjectState: SharedProjectUiState = {
  capabilities: {
    canComment: false,
    canCreateSnapshots: false,
    canDownloadWebster: false,
    canEdit: true,
    canManageMembers: false,
    canRestoreSnapshots: false,
  },
  connectionStatus: 'disconnected',
  currentVersion: null,
  error: null,
  errorRequiresUpgrade: false,
  isBusy: false,
  mode: 'local',
  pendingCommitCount: 0,
  projectId: null,
  projectName: null,
  role: null,
  snapshots: [],
  users: [],
};

export function EditorPage() {
  const {
    getIdTokenClaims,
    isAuthenticated,
    isLoading: isAuthLoading,
    loginWithPopup,
    user,
  } = useAuth0();
  const subscription = useSubscription();
  const emptyImageInputRef = useRef<HTMLInputElement | null>(null);
  const emptyProjectInputRef = useRef<HTMLInputElement | null>(null);
  const sidePanelsRef = useRef<HTMLElement | null>(null);
  const documentCounterRef = useRef(1);
  const [selectedTool, setSelectedTool] = useState('Move');
  const [showCanvasBorder, setShowCanvasBorder] = useState(true);
  const [selectedShape, setSelectedShape] = useState<ShapeKind>('rectangle');
  const [selectedSelectionMode, setSelectedSelectionMode] =
    useState<SelectionMode>('replace');
  const [magicSelectionTolerance, setMagicSelectionTolerance] = useState(12);
  const [selectedStrokeStyle, setSelectedStrokeStyle] =
    useState<StrokeStyle>('pencil');
  const [selectedStrokeColor, setSelectedStrokeColor] = useState<
    [number, number, number, number]
  >([0.07, 0.08, 0.09, 0.82]);
  const [selectedStrokeMode, setSelectedStrokeMode] = useState<
    'draw' | 'erase'
  >('draw');
  const [selectedStrokeTargetLayerId, setSelectedStrokeTargetLayerId] =
    useState<string | null>(null);
  const [selectedStrokeTargetMode, setSelectedStrokeTargetMode] = useState<
    'layer' | 'new' | 'selected'
  >('new');
  const [selectedStrokeWidth, setSelectedStrokeWidth] = useState(3);
  const [maskBrushOptions, setMaskBrushOptions] = useState<MaskBrushOptions>({
    mode: 'hide',
    opacity: 1,
    size: 48,
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [zoomPercentage, setZoomPercentage] = useState(100);
  const [tabs, setTabs] = useState<EditorDocumentTab[]>(initialTabs);
  const [isExportImageDialogOpen, setIsExportImageDialogOpen] = useState(false);
  const [isNewDocumentDialogOpen, setIsNewDocumentDialogOpen] = useState(false);
  const [isShareProjectDialogOpen, setIsShareProjectDialogOpen] = useState(false);
  const [isUploadSharePromptOpen, setIsUploadSharePromptOpen] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<
    | { type: 'invite'; token: string }
    | { projectId: string; projectName?: string; type: 'open-cloud' }
    | { type: 'share-local' }
    | null
  >(null);
  const isEmailVerifiedForCloud =
    isAuthenticated && user?.email_verified !== false;
  const [openShareDialogAfterCloudUpload, setOpenShareDialogAfterCloudUpload] =
    useState(false);
  const [isObject3DImportDialogOpen, setIsObject3DImportDialogOpen] =
    useState(false);
  const [object3DImportInitialFiles, setObject3DImportInitialFiles] = useState<
    File[]
  >([]);
  const [object3DImportMode, setObject3DImportMode] = useState<
    'add' | 'replace'
  >('add');
  const [isResizeCanvasDialogOpen, setIsResizeCanvasDialogOpen] =
    useState(false);
  const [isResizeImageDialogOpen, setIsResizeImageDialogOpen] = useState(false);
  const [imageLayerCommandPendingState, setImageLayerCommandPendingState] =
    useState<ImageLayerCommandPendingState | null>(null);
  const [layerAssetCommandPendingState, setLayerAssetCommandPendingState] =
    useState<LayerAssetCommandPendingState | null>(null);
  const [projectFilePendingState, setProjectFilePendingState] =
    useState<ProjectFilePendingState | null>(null);
  const [recentProjectError, setRecentProjectError] = useState<string | null>(
    null,
  );
  const [userTemplates, setUserTemplates] = useState<
    UserProjectTemplateSummary[]
  >([]);
  const [historyState, setHistoryState] =
    useState<HistoryStateSnapshot>(emptyHistoryState);
  const [layers, setLayers] = useState<LayerSummary[]>(initialLayers);
  const [sharedProjectState, setSharedProjectState] =
    useState<SharedProjectUiState>(initialSharedProjectState);
  const [importedFontFamilies, setImportedFontFamilies] = useState<string[]>(
    [],
  );
  const [uploadRequest, setUploadRequest] = useState<{
    file: File;
    id: number;
  } | null>(null);
  const [imageDocumentRequest, setImageDocumentRequest] = useState<{
    file: File;
    id: number;
    tabId: string;
  } | null>(null);
  const [selectLayerRequest, setSelectLayerRequest] = useState<{
    id: number;
    layerIds: string[];
  } | null>(null);
  const [layerCommandRequest, setLayerCommandRequest] = useState<{
    command: LayerCommand;
    id: number;
  } | null>(null);
  const [layerAssetCommandRequest, setLayerAssetCommandRequest] = useState<{
    command: LayerAssetCommand;
    id: number;
  } | null>(null);
  const [imageLayerCommandRequest, setImageLayerCommandRequest] = useState<{
    command: ImageLayerCommand;
    id: number;
  } | null>(null);
  const [documentCommandRequest, setDocumentCommandRequest] = useState<{
    command: DocumentCommand;
    id: number;
  } | null>(null);
  const [projectFileRequest, setProjectFileRequest] = useState<{
    id: number;
    file: File;
    handle?: WebsterFileHandle | null;
    tabId: string;
  } | null>(null);
  const [projectSaveRequest, setProjectSaveRequest] = useState<{
    id: number;
    mode: 'save' | 'save-as';
  } | null>(null);
  const [templateSaveRequest, setTemplateSaveRequest] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [templateExportRequest, setTemplateExportRequest] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [templateInsertRequest, setTemplateInsertRequest] = useState<{
    file: File;
    id: number;
    name: string;
    tabId: string;
  } | null>(null);
  const [imageExportRequest, setImageExportRequest] = useState<{
    background: ImageExportBackground;
    format: ImageExportFormat;
    id: number;
    title: string;
  } | null>(null);
  const [historyCommandRequest, setHistoryCommandRequest] = useState<{
    command: 'redo' | 'undo';
    id: number;
  } | null>(null);
  const [selectionCommandRequest, setSelectionCommandRequest] = useState<{
    command: SelectionCommand;
    id: number;
  } | null>(null);
  const [clipboardCommandRequest, setClipboardCommandRequest] = useState<{
    command: EditorClipboardCommand;
    id: number;
  } | null>(null);
  const [collaborationRequest, setCollaborationRequest] =
    useState<SharedProjectRequest | null>(null);
  const [closedDocumentRequest, setClosedDocumentRequest] = useState<{
    id: number;
    tabId: string;
  } | null>(null);
  const [toolsPanelWidth, setToolsPanelWidth] = useState(55);
  const [rightPanelWidth, setRightPanelWidth] = useState(380);
  const [layersPanelHeight, setLayersPanelHeight] = useState(280);
  const [propertiesPanelHeight, setPropertiesPanelHeight] = useState(360);
  const [collapsedSidePanels, setCollapsedSidePanels] = useState<
    Record<SidePanelId, boolean>
  >({
    history: false,
    layers: false,
    properties: false,
    versions: false,
  });

  const layoutStyle: EditorLayoutVars = {
    '--tools-panel-width': `${Math.max(68, toolsPanelWidth)}px`,
    '--right-panel-width': `${rightPanelWidth}px`,
    '--layers-panel-height': `${layersPanelHeight}px`,
    '--properties-panel-height': `${propertiesPanelHeight}px`,
  };

  useEffect(() => {
    const collapseToolsForNarrowViewport = () => {
      if (window.innerWidth <= 980) {
        setToolsPanelWidth(68);
      }
    };

    collapseToolsForNarrowViewport();
    window.addEventListener('resize', collapseToolsForNarrowViewport);

    return () => {
      window.removeEventListener('resize', collapseToolsForNarrowViewport);
    };
  }, []);

  const selectedLayers = layers.filter((layer) => layer.isSelected);
  const selectedLayer = selectedLayers.length === 1 ? selectedLayers[0] : null;
  const selectedLayerIds = new Set(selectedLayers.map((layer) => layer.id));
  const groupableSelectedLayerIds = selectedLayers
    .filter(
      (layer) => !hasSelectedAncestorLayer(layer, layers, selectedLayerIds),
    )
    .map((layer) => layer.id);
  const canGroupSelectedLayers = groupableSelectedLayerIds.length > 1;
  const selectedImageLayer = isImageLayerSummary(selectedLayer)
    ? selectedLayer
    : null;
  const selectedTextLayer =
    selectedLayer?.type === 'text' ? selectedLayer : null;
  const selectedObject3DLayer = isObject3DLayerSummary(selectedLayer)
    ? selectedLayer
    : null;
  const activeDocument = tabs.find((tab) => tab.isActive) ?? tabs[0] ?? null;
  const activeHistoryState = activeDocument ? historyState : emptyHistoryState;
  const canEditDocument =
    Boolean(activeDocument) &&
    (sharedProjectState.mode === 'local' ||
      sharedProjectState.capabilities.canEdit);
  const strokeLayers = layers.filter((layer) => layer.type === 'stroke');
  const textLayerFontFamilies = layers
    .filter(
      (layer): layer is LayerSummary & { fontFamily: string } =>
        layer.type === 'text',
    )
    .map((layer) => layer.fontFamily);

  useEffect(() => {
    if (activeDocument) {
      return;
    }

    function handlePaste(event: ClipboardEvent) {
      if (isEditableEventTarget(event.target)) {
        return;
      }

      const file = getPastedImageFile(event);

      if (!file) {
        return;
      }

      event.preventDefault();
      void openImageAsNewDocument(file);
    }

    window.addEventListener('paste', handlePaste);

    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [activeDocument]);

  useEffect(() => {
    if (
      selectedStrokeTargetMode === 'layer' &&
      selectedStrokeTargetLayerId &&
      !strokeLayers.some((layer) => layer.id === selectedStrokeTargetLayerId)
    ) {
      setSelectedStrokeTargetLayerId(null);
      setSelectedStrokeTargetMode('new');
    }
  }, [selectedStrokeTargetLayerId, selectedStrokeTargetMode, strokeLayers]);

  useEffect(() => {
    if (!activeDocument) {
      setHistoryState(emptyHistoryState);
    }
  }, [activeDocument]);

  useEffect(() => {
    // Mirror the active shared projectId into ?projectId=... so refreshing the
    // page restores the same project. Use history.replaceState to avoid the
    // Next.js router reloading the editor. We only WRITE the param — never
    // delete it on local mode, because on initial mount we briefly are in
    // local mode while the URL still carries the projectId we want to load.
    if (typeof window === 'undefined') return;

    if (sharedProjectState.mode !== 'shared' || !sharedProjectState.projectId) {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get('projectId') !== sharedProjectState.projectId) {
      url.searchParams.set('projectId', sharedProjectState.projectId);
      window.history.replaceState(null, '', url.toString());
    }

    // Remember this open for the home "Recently opened" catalog.
    recordOpenedProject(
      sharedProjectState.projectId,
      sharedProjectState.projectName ?? 'Untitled project',
    );

    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.isActive ? { ...tab, source: 'shared' } : tab,
      ),
    );
  }, [sharedProjectState.mode, sharedProjectState.projectId, sharedProjectState.projectName]);

  useEffect(() => {
    if (!openShareDialogAfterCloudUpload) {
      return;
    }

    if (sharedProjectState.mode === 'shared' && sharedProjectState.projectId) {
      setIsShareProjectDialogOpen(true);
      setOpenShareDialogAfterCloudUpload(false);
      return;
    }

    if (sharedProjectState.error) {
      setOpenShareDialogAfterCloudUpload(false);
    }
  }, [
    openShareDialogAfterCloudUpload,
    sharedProjectState.error,
    sharedProjectState.mode,
    sharedProjectState.projectId,
  ]);

  const didApplyUrlProjectIdRef = useRef(false);

  useEffect(() => {
    // On first mount, if ?projectId=<id> is in the URL, auto-open that shared
    // project. Runs exactly once so user actions don't get clobbered.
    if (didApplyUrlProjectIdRef.current) return;
    if (typeof window === 'undefined') return;
    if (isAuthLoading) return;
    didApplyUrlProjectIdRef.current = true;

    const url = new URL(window.location.href);
    const inviteToken = url.searchParams.get('invite');
    if (inviteToken) {
      if (!isAuthLoading && !isAuthenticated) {
        setAuthPrompt({ token: inviteToken, type: 'invite' });
        return;
      }

      if (!isEmailVerifiedForCloud) {
        setRecentProjectError(
          'Confirm your email before using cloud projects or accepting invites.',
        );
        url.searchParams.delete('invite');
        window.history.replaceState(null, '', url.toString());
        return;
      }

      void acceptProjectInvite(inviteToken)
        .then((result) => {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete('invite');
          nextUrl.searchParams.set('projectId', result.projectId);
          window.history.replaceState(null, '', nextUrl.toString());
          openSharedProjectById(result.projectId, result.projectName);
        })
        .catch((error) => {
          setRecentProjectError(
            error instanceof Error ? error.message : 'Unable to accept invite.',
          );
        });
      return;
    }

    const urlProjectId = url.searchParams.get('projectId');
    if (!urlProjectId) return;
    if (!isEmailVerifiedForCloud) {
      setRecentProjectError('Confirm your email before opening cloud projects.');
      url.searchParams.delete('projectId');
      window.history.replaceState(null, '', url.toString());
      return;
    }
    if (sharedProjectState.mode === 'shared' && sharedProjectState.projectId === urlProjectId) {
      return;
    }

    documentCounterRef.current += 1;
    const tab: EditorDocumentTab = {
      height: 600,
      id: `document-${documentCounterRef.current}`,
      isActive: true,
      source: 'shared',
      title: `Shared ${urlProjectId}`,
      width: 800,
    };
    setTabs((currentTabs) => [
      ...currentTabs.map((currentTab) => ({ ...currentTab, isActive: false })),
      tab,
    ]);
    setCollaborationRequest({
      id: Date.now(),
      projectId: urlProjectId,
      type: 'open-shared',
    });
  }, [
    isAuthenticated,
    isAuthLoading,
    isEmailVerifiedForCloud,
    sharedProjectState.mode,
    sharedProjectState.projectId,
  ]);

  useEffect(() => {
    let didCancel = false;

    async function loadUserTemplates() {
      const templates = await listUserProjectTemplates().catch(() => []);

      if (!didCancel) {
        setUserTemplates(templates);
      }
    }

    void loadUserTemplates();

    return () => {
      didCancel = true;
    };
  }, [tabs.length]);

  function runLayerCommand(command: LayerCommand) {
    if (!canEditDocument) {
      return;
    }

    setLayerCommandRequest({ command, id: Date.now() });
  }

  function runLayerAssetCommand(command: LayerAssetCommand) {
    if (!canEditDocument) {
      return;
    }

    setLayerAssetCommandRequest({ command, id: Date.now() });
  }

  function switchToLocalMode() {
    if (sharedProjectState.mode === 'local') {
      clearSharedProjectUrlParam();
      return;
    }

    clearSharedProjectUrlParam();
    setCollaborationRequest({
      id: Date.now(),
      type: 'switch-local',
    });
  }

  function clearSharedProjectUrlParam() {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);

    if (!url.searchParams.has('projectId')) {
      return;
    }

    url.searchParams.delete('projectId');
    window.history.replaceState(null, '', url.toString());
  }

  function rememberImportedFontFamily(fontFamily: string) {
    setImportedFontFamilies((currentFamilies) =>
      currentFamilies.includes(fontFamily)
        ? currentFamilies
        : [...currentFamilies, fontFamily].sort((a, b) => a.localeCompare(b)),
    );
  }

  function addBasicObject3DLayer(
    objectKind: Exclude<Object3DKind, 'imported'>,
  ) {
    runLayerCommand({ objectKind, type: 'add-object3d' });
    setLayerAssetCommandPendingState(null);
    setIsObject3DImportDialogOpen(false);
  }

  function openObject3DImportDialog(
    mode: 'add' | 'replace',
    initialFiles: File[] = [],
  ) {
    // 3D models are a Pro feature. Gate every entry point at this single
    // chokepoint. While the subscription is still loading we treat the user as
    // not-Pro (fail safe) rather than letting the dialog slip through.
    if (!subscription.isPro) {
      const goToBilling = window.confirm(
        '3D models are a Pro feature. Go to billing to upgrade?',
      );
      if (goToBilling) {
        window.location.assign('/billing');
      }
      return;
    }

    setObject3DImportMode(mode);
    setObject3DImportInitialFiles(initialFiles);
    setLayerAssetCommandPendingState(null);
    setIsObject3DImportDialogOpen(true);
  }

  function useLoadedObject3DModel(model: Imported3DModel) {
    if (
      object3DImportMode === 'replace' &&
      selectedObject3DLayer &&
      !selectedObject3DLayer.locked
    ) {
      runLayerAssetCommand({
        layerId: selectedObject3DLayer.id,
        model,
        type: 'replace-loaded-3d-model',
      });
    } else {
      runLayerAssetCommand({ model, type: 'create-loaded-3d-model-layer' });
    }

    setLayerAssetCommandPendingState(null);
    setIsObject3DImportDialogOpen(false);
    setObject3DImportInitialFiles([]);
    setObject3DImportMode('add');
  }

  function runClipboardCommand(command: EditorClipboardCommand) {
    setClipboardCommandRequest({ command, id: Date.now() });
  }

  function groupSelectedLayers() {
    if (!canEditDocument) {
      return;
    }

    if (groupableSelectedLayerIds.length < 2) {
      return;
    }

    runLayerCommand({
      layerIds: groupableSelectedLayerIds,
      name: 'Group',
      type: 'group',
    });
  }

  async function refreshUserTemplates() {
    setUserTemplates(await listUserProjectTemplates().catch(() => []));
  }

  function activateTab(tabId: string) {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => ({
        ...tab,
        isActive: tab.id === tabId,
      })),
    );
  }

  function createDocumentTab(size: NewDocumentSize) {
    switchToLocalMode();
    documentCounterRef.current += 1;

    const tab: EditorDocumentTab = {
      height: size.height,
      id: `document-${documentCounterRef.current}`,
      isActive: true,
      source: 'local-only',
      title: `Untitled ${documentCounterRef.current}`,
      width: size.width,
    };

    setTabs((currentTabs) => [
      ...currentTabs.map((currentTab) => ({ ...currentTab, isActive: false })),
      tab,
    ]);
    setImageDocumentRequest(null);
    setIsNewDocumentDialogOpen(false);
  }

  async function createDocumentFromUserTemplate(
    template: UserProjectTemplateSummary,
  ) {
    switchToLocalMode();
    const storedTemplate = await getUserProjectTemplate(template.id);

    if (!storedTemplate) {
      window.alert('Template is no longer available.');
      await refreshUserTemplates();
      return;
    }

    documentCounterRef.current += 1;

    const title =
      storedTemplate.name || `Template ${documentCounterRef.current}`;
    const tab: EditorDocumentTab = {
      height: storedTemplate.height,
      id: `document-${documentCounterRef.current}`,
      isActive: true,
      source: 'local-only',
      title,
      width: storedTemplate.width,
    };

    setTabs((currentTabs) => [
      ...currentTabs.map((currentTab) => ({ ...currentTab, isActive: false })),
      tab,
    ]);
    setTemplateInsertRequest({
      file: new File([storedTemplate.projectBlob], getProjectFilename(title), {
        type: 'application/vnd.webster.project',
      }),
      id: Date.now(),
      name: storedTemplate.name,
      tabId: tab.id,
    });
    setRecentProjectError(null);
    setIsNewDocumentDialogOpen(false);
  }

  async function renameUserTemplate(
    template: UserProjectTemplateSummary,
    name: string,
  ) {
    await renameUserProjectTemplate(template.id, name).catch(() => null);
    await refreshUserTemplates();
  }

  async function deleteUserTemplate(template: UserProjectTemplateSummary) {
    await deleteUserProjectTemplate(template.id).catch(() => undefined);
    await refreshUserTemplates();
  }

  async function importUserTemplateFile(file: File) {
    try {
      await importUserProjectTemplate(file);
      await refreshUserTemplates();
    } catch {
      window.alert(
        'Unable to import template. Please choose a valid .webster project file.',
      );
    }
  }

  async function exportUserTemplate(template: UserProjectTemplateSummary) {
    const storedTemplate = await getUserProjectTemplate(template.id);

    if (!storedTemplate) {
      window.alert('Template is no longer available.');
      await refreshUserTemplates();
      return;
    }

    downloadBlob(
      storedTemplate.projectBlob,
      getProjectFilename(storedTemplate.name),
    );
  }

  async function insertUserTemplate(template: UserProjectTemplateSummary) {
    const storedTemplate = await getUserProjectTemplate(template.id);

    if (!activeDocument) {
      await createDocumentFromUserTemplate(template);
      return;
    }

    if (!storedTemplate) {
      window.alert('Template is no longer available.');
      await refreshUserTemplates();
      return;
    }

    setTemplateInsertRequest({
      file: new File(
        [storedTemplate.projectBlob],
        getProjectFilename(storedTemplate.name),
        {
          type: 'application/vnd.webster.project',
        },
      ),
      id: Date.now(),
      name: storedTemplate.name,
      tabId: activeDocument.id,
    });
    setIsNewDocumentDialogOpen(false);
  }

  function saveCurrentProjectAsTemplate() {
    const name = window.prompt(
      'Template name',
      activeDocument?.title ?? 'Template',
    );

    if (name === null) {
      return;
    }

    setTemplateSaveRequest({
      id: Date.now(),
      name,
    });
  }

  function exportCurrentProjectAsTemplate() {
    const name = window.prompt(
      'Template name',
      activeDocument?.title ?? 'Template',
    );

    if (name === null) {
      return;
    }

    setTemplateExportRequest({
      id: Date.now(),
      name,
    });
  }

  function requireVerifiedCloudAccess(message: string) {
    if (!isAuthenticated) {
      return false;
    }

    if (isEmailVerifiedForCloud) {
      return true;
    }

    window.alert(message);
    return false;
  }

  function shareCurrentProject() {
    if (!activeDocument) {
      window.alert('Open or create a project before sharing it.');
      return;
    }

    // Already in shared mode: just reopen the dialog instead of re-uploading.
    if (
      sharedProjectState.mode === 'shared' &&
      sharedProjectState.projectId
    ) {
      if (!isAuthenticated) {
        setAuthPrompt({ type: 'share-local' });
        return;
      }

      if (!requireVerifiedCloudAccess('Confirm your email before managing cloud sharing.')) {
        return;
      }

      setIsShareProjectDialogOpen(true);
      return;
    }

    if (!isAuthenticated) {
      setAuthPrompt({ type: 'share-local' });
      return;
    }

    if (!requireVerifiedCloudAccess('Confirm your email before uploading projects to cloud.')) {
      return;
    }

    setIsUploadSharePromptOpen(true);
  }

  function uploadLocalProjectAndContinueSharing() {
    if (!activeDocument) {
      return;
    }

    if (!isAuthenticated) {
      setIsUploadSharePromptOpen(false);
      setAuthPrompt({ type: 'share-local' });
      return;
    }

    if (!requireVerifiedCloudAccess('Confirm your email before uploading projects to cloud.')) {
      setIsUploadSharePromptOpen(false);
      return;
    }

    startLocalProjectUploadShare();
  }

  function startLocalProjectUploadShare() {
    if (!activeDocument) {
      return;
    }

    setIsUploadSharePromptOpen(false);
    setOpenShareDialogAfterCloudUpload(true);
    setCollaborationRequest({
      id: Date.now(),
      title: activeDocument.title,
      type: 'share-local',
    });
  }

  function openSharedProjectById(projectId: string, title?: string) {
    const trimmed = projectId.trim();
    if (!trimmed) {
      return;
    }

    if (!isAuthenticated) {
      setAuthPrompt({ projectId: trimmed, projectName: title, type: 'open-cloud' });
      return;
    }

    if (!requireVerifiedCloudAccess('Confirm your email before opening cloud projects.')) {
      return;
    }

    startOpenSharedProject(trimmed, title);
  }

  function startOpenSharedProject(projectId: string, title?: string) {
    // Reflect the click in the URL immediately, before we even start loading.
    // The mode→shared mirror effect only fires after the load completes, so if
    // the REST/WS round trip is slow (or hangs), we'd otherwise leave the user
    // staring at a bare /. Doing it here makes refresh restore the right
    // project even if the original load never finished.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('projectId') !== projectId) {
        url.searchParams.set('projectId', projectId);
        window.history.replaceState(null, '', url.toString());
      }
    }

    documentCounterRef.current += 1;
    const tab: EditorDocumentTab = {
      height: 600,
      id: `document-${documentCounterRef.current}`,
      isActive: true,
      source: 'shared',
      title: title?.trim() || `Shared ${projectId}`,
      width: 800,
    };

    setTabs((currentTabs) => [
      ...currentTabs.map((currentTab) => ({
        ...currentTab,
        isActive: false,
      })),
      tab,
    ]);

    setCollaborationRequest({
      id: Date.now(),
      projectId,
      type: 'open-shared',
    });
  }

  function openSharedProject() {
    const projectId = window.prompt('Shared project ID');

    if (!projectId?.trim()) {
      return;
    }

    openSharedProjectById(projectId);
  }

  async function signInForCloudAction() {
    const pendingAction = authPrompt;

    if (!pendingAction) {
      return;
    }

    try {
      await loginWithPopup();
      setAuthPrompt(null);

      const claims = await getIdTokenClaims().catch(() => null);
      if (claims?.email_verified === false) {
        window.alert('Confirm your email before using cloud projects.');
        return;
      }

      if (pendingAction.type === 'share-local') {
        if (sharedProjectState.mode === 'shared' && sharedProjectState.projectId) {
          setIsShareProjectDialogOpen(true);
          return;
        }

        startLocalProjectUploadShare();
        return;
      }

      if (pendingAction.type === 'open-cloud') {
        startOpenSharedProject(
          pendingAction.projectId,
          pendingAction.projectName,
        );
        return;
      }

      void acceptProjectInvite(pendingAction.token)
        .then((result) => {
          if (typeof window !== 'undefined') {
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.delete('invite');
            nextUrl.searchParams.set('projectId', result.projectId);
            window.history.replaceState(null, '', nextUrl.toString());
          }
          startOpenSharedProject(result.projectId, result.projectName);
        })
        .catch((error) => {
          setRecentProjectError(
            error instanceof Error ? error.message : 'Unable to accept invite.',
          );
        });
    } catch {
      // The user closed the popup or Auth0 declined the attempt; keep the prompt open.
    }
  }

  function cancelCloudAuthPrompt() {
    const pendingAction = authPrompt;

    setAuthPrompt(null);

    if (!pendingAction || typeof window === 'undefined') {
      return;
    }

    const nextUrl = new URL(window.location.href);

    if (pendingAction.type === 'open-cloud') {
      nextUrl.searchParams.delete('projectId');
    } else if (pendingAction.type === 'invite') {
      nextUrl.searchParams.delete('invite');
    }

    if (nextUrl.href !== window.location.href) {
      window.history.replaceState(null, '', nextUrl.toString());
    }
  }

  function downloadSharedProject() {
    setCollaborationRequest({
      id: Date.now(),
      type: 'download-webster',
    });
  }

  function createSharedSnapshot() {
    const message = window.prompt('Snapshot message', '');

    if (message === null) {
      return;
    }

    setCollaborationRequest({
      id: Date.now(),
      message,
      type: 'create-snapshot',
    });
  }

  function restoreSharedSnapshot(snapshotId: string) {
    setCollaborationRequest({
      id: Date.now(),
      snapshotId,
      type: 'restore-snapshot',
    });
  }

  function refreshSharedSnapshots() {
    setCollaborationRequest({
      id: Date.now(),
      type: 'refresh-snapshots',
    });
  }

  function updateActiveTabFromSharedDocument(document: {
    height: number;
    title: string;
    width: number;
  }) {
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.isActive
          ? {
              ...tab,
              height: document.height,
              source: 'shared',
              title: document.title,
              width: document.width,
            }
          : tab,
      ),
    );
  }

  function closeDocumentTab(tabId: string) {
    const closingTab = tabs.find((tab) => tab.id === tabId);

    if (closingTab?.isActive && sharedProjectState.mode === 'shared') {
      switchToLocalMode();
    }

    setTabs((currentTabs) => {
      const closedIndex = currentTabs.findIndex((tab) => tab.id === tabId);

      if (closedIndex < 0) {
        return currentTabs;
      }

      const closingActiveTab = currentTabs[closedIndex].isActive;
      const remainingTabs = currentTabs.filter((tab) => tab.id !== tabId);

      if (remainingTabs.length === 0) {
        setLayers([]);
        setZoomPercentage(100);
        return [];
      }

      if (!closingActiveTab) {
        return remainingTabs;
      }

      const nextActiveIndex = Math.min(closedIndex, remainingTabs.length - 1);

      return remainingTabs.map((tab, index) => ({
        ...tab,
        isActive: index === nextActiveIndex,
      }));
    });
    setClosedDocumentRequest({ id: Date.now(), tabId });
  }

  function renameDocumentTab(tabId: string, title: string) {
    const currentTab = tabs.find((tab) => tab.id === tabId);
    const nextTitle = title.trim() || 'Untitled';

    if (!currentTab || currentTab.title === nextTitle) {
      return;
    }

    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              title: nextTitle,
            }
          : tab,
      ),
    );

    if (
      currentTab.isActive &&
      window.confirm(`Save this project as "${getProjectFilename(nextTitle)}"?`)
    ) {
      setProjectSaveRequest({ id: Date.now(), mode: 'save-as' });
    }
  }

  function openProjectInNewTab(file: File, handle?: WebsterFileHandle | null) {
    switchToLocalMode();
    documentCounterRef.current += 1;

    const tab: EditorDocumentTab = {
      height: 800,
      id: `document-${documentCounterRef.current}`,
      isActive: true,
      source: 'local-file',
      title:
        file.name.replace(/\.webster$/i, '') ||
        `Untitled ${documentCounterRef.current}`,
      width: 1200,
    };

    setTabs((currentTabs) => [
      ...currentTabs.map((currentTab) => ({ ...currentTab, isActive: false })),
      tab,
    ]);
    setProjectFileRequest({
      file,
      handle,
      id: Date.now(),
      tabId: tab.id,
    });
    setRecentProjectError(null);
  }

  async function openImageAsNewDocument(file: File) {
    try {
      switchToLocalMode();
      const dimensions = await loadImageDimensions(file);

      documentCounterRef.current += 1;

      const title =
        file.name.replace(/\.[^.]+$/u, '') ||
        `Image ${documentCounterRef.current}`;
      const tab: EditorDocumentTab = {
        height: dimensions.height,
        id: `document-${documentCounterRef.current}`,
        isActive: true,
        source: 'local-only',
        title,
        width: dimensions.width,
      };

      setTabs((currentTabs) => [
        ...currentTabs.map((currentTab) => ({
          ...currentTab,
          isActive: false,
        })),
        tab,
      ]);
      setImageDocumentRequest({
        file,
        id: Date.now(),
        tabId: tab.id,
      });
      setRecentProjectError(null);
    } catch {
      setRecentProjectError('Unable to open image.');
    }
  }

  async function openProjectHandle(handle: WebsterFileHandle | null) {
    try {
      if (!handle?.getFile) {
        setRecentProjectError(
          'No recent project is saved in this browser yet.',
        );
        return;
      }

      const permission = handle.queryPermission
        ? await handle.queryPermission({ mode: 'read' })
        : 'granted';
      const grantedPermission =
        permission === 'granted' ||
        (handle.requestPermission
          ? (await handle.requestPermission({ mode: 'read' })) === 'granted'
          : false);

      if (!grantedPermission) {
        setRecentProjectError(
          'Browser permission is needed to reopen the recent project.',
        );
        return;
      }

      openProjectInNewTab(await handle.getFile(), handle);
    } catch {
      setRecentProjectError('Unable to open the recent project.');
    }
  }

  async function openRecentProject() {
    await openProjectHandle(await readRememberedProjectFileHandle());
  }

  async function openProjectPickerFromEmptyState() {
    setRecentProjectError(null);

    if (canPickProjectFileHandle()) {
      try {
        const pickedProject = await pickProjectFileWithHandle();

        if (pickedProject) {
          openProjectInNewTab(pickedProject.file, pickedProject.handle);
        }

        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setRecentProjectError('Unable to open project.');
        return;
      }
    }

    emptyProjectInputRef.current?.click();
  }

  function handleEmptyStateDragOver(event: ReactDragEvent<HTMLElement>) {
    if (!hasOpenableDragData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleEmptyStateDrop(event: ReactDragEvent<HTMLElement>) {
    const file = getOpenableFile(event.dataTransfer.files);

    if (!file) {
      return;
    }

    event.preventDefault();
    openDroppedFile(file);
  }

  function openDroppedFile(file: File) {
    setRecentProjectError(null);

    if (isWebsterProjectFile(file)) {
      openProjectInNewTab(file, null);
      return;
    }

    if (isImageFile(file)) {
      void openImageAsNewDocument(file);
    }
  }

  function getSidePanelHeight() {
    return (
      sidePanelsRef.current?.getBoundingClientRect().height ??
      window.innerHeight - 64
    );
  }

  function getMaxLayersPanelHeight() {
    return Math.max(
      layersPanelMinHeight,
      getSidePanelHeight() -
        getPanelHeightForResize(
          'properties',
          propertiesPanelHeight,
          propertiesPanelMinHeight,
        ) -
        getPanelHeightForResize(
          'history',
          historyPanelMinHeight,
          historyPanelMinHeight,
        ) -
        sidePanelHandleHeight,
    );
  }

  function getMaxPropertiesPanelHeight() {
    return Math.max(
      propertiesPanelMinHeight,
      getSidePanelHeight() -
        getPanelHeightForResize(
          'layers',
          layersPanelHeight,
          layersPanelMinHeight,
        ) -
        getPanelHeightForResize(
          'history',
          historyPanelMinHeight,
          historyPanelMinHeight,
        ) -
        sidePanelHandleHeight,
    );
  }

  function getPanelHeightForResize(
    id: SidePanelId,
    height: number,
    minHeight: number,
  ) {
    return collapsedSidePanels[id]
      ? collapsedSidePanelHeight
      : Math.max(height, minHeight);
  }

  function toggleSidePanelCollapsed(id: SidePanelId) {
    setCollapsedSidePanels((currentPanels) => ({
      ...currentPanels,
      [id]: !currentPanels[id],
    }));
  }

  function startResize(onMove: (moveEvent: PointerEvent) => void) {
    document.body.classList.add('is-resizing-editor');

    function stopResize() {
      document.body.classList.remove('is-resizing-editor');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stopResize);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stopResize, { once: true });
  }

  function startToolsResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startX = event.clientX;
    const startWidth = toolsPanelWidth;

    function resize(moveEvent: PointerEvent) {
      setToolsPanelWidth(
        clamp(startWidth + moveEvent.clientX - startX, 68, 320),
      );
    }

    startResize(resize);
  }

  function startRightPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startX = event.clientX;
    const startWidth = rightPanelWidth;

    function resize(moveEvent: PointerEvent) {
      setRightPanelWidth(
        clamp(startWidth - (moveEvent.clientX - startX), 320, 760),
      );
    }

    startResize(resize);
  }

  function startLayersResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startY = event.clientY;
    const startHeight = layersPanelHeight;

    function resize(moveEvent: PointerEvent) {
      setLayersPanelHeight(
        clamp(
          startHeight + moveEvent.clientY - startY,
          layersPanelMinHeight,
          getMaxLayersPanelHeight(),
        ),
      );
    }

    startResize(resize);
  }

  function startPropertiesResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startY = event.clientY;
    const startHeight = propertiesPanelHeight;

    function resize(moveEvent: PointerEvent) {
      setPropertiesPanelHeight(
        clamp(
          startHeight + moveEvent.clientY - startY,
          propertiesPanelMinHeight,
          getMaxPropertiesPanelHeight(),
        ),
      );
    }

    startResize(resize);
  }

  return (
    <main className='grid h-screen min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[#101113] text-[13px] text-[#e7e9ec] min-[1400px]:text-[14px] max-[760px]:h-[100svh]'>
      <Toolbar
        canDownloadSharedProject={
          sharedProjectState.capabilities.canDownloadWebster
        }
        canEditDocument={canEditDocument}
        canGroupSelectedLayers={canGroupSelectedLayers}
        canManageSharing={sharedProjectState.capabilities.canManageMembers}
        canRedo={canEditDocument && activeHistoryState.canRedo}
        canUndo={canEditDocument && activeHistoryState.canUndo}
        canvasSize={
          activeDocument
            ? {
                height: activeDocument.height,
                width: activeDocument.width,
              }
            : null
        }
        collaborationStatus={sharedProjectState.connectionStatus}
        documentTitle={activeDocument?.title ?? 'No document'}
        isSharedMode={sharedProjectState.mode === 'shared'}
        onCopy={() => runClipboardCommand('copy')}
        onCut={() => runClipboardCommand('cut')}
        onDeleteSelectedLayer={() => {
          if (selectedLayer) {
            runLayerCommand({ layerId: selectedLayer.id, type: 'delete' });
          }
        }}
        onDownloadSharedProject={downloadSharedProject}
        onDuplicateSelectedLayer={() => {
          if (selectedLayer) {
            runLayerCommand({ layerId: selectedLayer.id, type: 'duplicate' });
          }
        }}
        onGroupSelectedLayers={groupSelectedLayers}
        onNewDocument={() => setIsNewDocumentDialogOpen(true)}
        onOpenCanvasResize={() => setIsResizeCanvasDialogOpen(true)}
        onOpenExportDialog={() => setIsExportImageDialogOpen(true)}
        onOpenImageResize={() => setIsResizeImageDialogOpen(true)}
        onOpenProject={openProjectInNewTab}
        onOpenSharedProject={openSharedProject}
        onOpenVersionHistory={() =>
          setCollapsedSidePanels((currentPanels) => ({
            ...currentPanels,
            versions: false,
          }))
        }
        onPaste={() => runClipboardCommand('paste')}
        onOpenImageDocument={(file) => void openImageAsNewDocument(file)}
        onRedo={() =>
          setHistoryCommandRequest({ command: 'redo', id: Date.now() })
        }
        onRestoreImageOriginal={() => {
          if (!selectedImageLayer) {
            return;
          }

          setImageLayerCommandRequest({
            command: {
              layerId: selectedImageLayer.id,
              type: 'restore-original',
            },
            id: Date.now(),
          });
        }}
        onSaveAsProject={() =>
          setProjectSaveRequest({ id: Date.now(), mode: 'save-as' })
        }
        onSaveProject={() =>
          setProjectSaveRequest({ id: Date.now(), mode: 'save' })
        }
        onShareProject={shareCurrentProject}
        onExportTemplate={exportCurrentProjectAsTemplate}
        onSaveTemplate={saveCurrentProjectAsTemplate}
        onAddAdjustmentLayer={() => runLayerCommand({ type: 'add-adjustment' })}
        onAddObject3DLayer={() => openObject3DImportDialog('add')}
        onSelectionCommand={(command) =>
          setSelectionCommandRequest({ command, id: Date.now() })
        }
        onSelectionModeChange={setSelectedSelectionMode}
        onSelectTool={setSelectedTool}
        onSelectShape={setSelectedShape}
        onShowCanvasBorderChange={setShowCanvasBorder}
        onUndo={() =>
          setHistoryCommandRequest({ command: 'undo', id: Date.now() })
        }
        onImportFont={(file) =>
          runLayerAssetCommand({
            file,
            layerId:
              selectedTextLayer && !selectedTextLayer.locked
                ? selectedTextLayer.id
                : null,
            type: 'import-font',
          })
        }
        onUploadImage={(file) => setUploadRequest({ file, id: Date.now() })}
        maskBrushOptions={maskBrushOptions}
        onMaskBrushOptionsChange={(options) =>
          setMaskBrushOptions((currentOptions) => ({
            ...currentOptions,
            ...options,
          }))
        }
        onStrokeColorChange={setSelectedStrokeColor}
        onStrokeModeChange={setSelectedStrokeMode}
        onStrokeStyleChange={(style) => {
          setSelectedStrokeStyle(style);
          setSelectedStrokeColor(getDefaultStrokeColor(style));
          setSelectedStrokeWidth(getDefaultStrokeWidth(style));
        }}
        onStrokeTargetChange={(target) => {
          setSelectedStrokeTargetLayerId(target.layerId);
          setSelectedStrokeTargetMode(target.mode);
        }}
        onStrokeWidthChange={(width) =>
          setSelectedStrokeWidth(Math.max(1, width || 1))
        }
        saveStatus={saveStatus}
        onlineUserCount={
          sharedProjectState.users.length ||
          (sharedProjectState.mode === 'shared' ? 1 : 0)
        }
        pendingCommitCount={sharedProjectState.pendingCommitCount}
        projectStorageLabel={getProjectStorageLabel(activeDocument, sharedProjectState)}
        projectRole={sharedProjectState.role}
        selectedLayer={selectedLayer}
        selectedSelectionMode={selectedSelectionMode}
        selectedShape={selectedShape}
        selectedStrokeColor={selectedStrokeColor}
        selectedStrokeMode={selectedStrokeMode}
        selectedStrokeStyle={selectedStrokeStyle}
        selectedStrokeTargetLayerId={selectedStrokeTargetLayerId}
        selectedStrokeTargetMode={selectedStrokeTargetMode}
        selectedStrokeWidth={selectedStrokeWidth}
        selectedTool={selectedTool}
        magicSelectionTolerance={magicSelectionTolerance}
        onMagicSelectionToleranceChange={setMagicSelectionTolerance}
        showCanvasBorder={showCanvasBorder}
        strokeLayers={strokeLayers}
        redoLabel={activeHistoryState.redoLabel}
        undoLabel={activeHistoryState.undoLabel}
        zoomPercentage={zoomPercentage}
      />
      <section
        className={cn(
          'grid min-h-0 transition-[grid-template-columns] duration-[220ms] ease-in-out',
          activeDocument ? 'has-document' : 'has-no-document',
          activeDocument
            ? 'grid-cols-[var(--tools-panel-width)_6px_minmax(360px,1fr)_6px_var(--right-panel-width)] max-[980px]:grid-cols-[68px_6px_minmax(300px,1fr)_6px_minmax(280px,var(--right-panel-width))] max-[760px]:grid-cols-[68px_6px_minmax(0,1fr)] max-[760px]:grid-rows-[minmax(0,1fr)_220px]'
            : 'grid-cols-[0_0_minmax(360px,1fr)_0_0] max-[980px]:grid-cols-[0_0_minmax(300px,1fr)_0_0] max-[760px]:grid-cols-[0_0_minmax(0,1fr)_0_0]',
        )}
        style={layoutStyle}
        aria-label='Editor workspace'
      >
        <ToolsPanel
          canCommentDocument={sharedProjectState.capabilities.canComment}
          canEditDocument={canEditDocument}
          onSelectTool={setSelectedTool}
          onSelectShape={setSelectedShape}
          selectedShape={selectedShape}
          selectedTool={selectedTool}
          tools={editorTools}
        />
        <ResizeHandle
          aria-label='Resize tools panel'
          className='pointer-events-none'
          hidden={!activeDocument}
          onPointerDown={() => {}}
          orientation='vertical'
        />
        <div
          className={cn(
            'grid min-h-0 min-w-0 transition-[grid-template-rows] duration-[220ms] ease-in-out',
            activeDocument ? 'grid-rows-[42px_minmax(0,1fr)]' : 'grid-rows-[0_minmax(0,1fr)]',
          )}
        >
          <TabsBar
            onCloseTab={closeDocumentTab}
            onRenameTab={renameDocumentTab}
            onSelectTab={activateTab}
            tabs={tabs}
          />
          {activeDocument ? (
            <CanvasView
              activeDocument={activeDocument}
              clipboardCommandRequest={clipboardCommandRequest}
              closedDocumentRequest={closedDocumentRequest}
              collaborationRequest={collaborationRequest}
              documentCommandRequest={documentCommandRequest}
              historyCommandRequest={historyCommandRequest}
              imageDocumentRequest={imageDocumentRequest}
              imageLayerCommandRequest={imageLayerCommandRequest}
              layerAssetCommandRequest={layerAssetCommandRequest}
              layerCommandRequest={layerCommandRequest}
              maskBrushOptions={maskBrushOptions}
              magicSelectionTolerance={magicSelectionTolerance}
              imageExportRequest={imageExportRequest}
              onFontImported={rememberImportedFontFamily}
              onCollaborationRequestHandled={(requestId) =>
                setCollaborationRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onCollaborationStateChange={setSharedProjectState}
              onHistoryChange={setHistoryState}
              onLayersChange={setLayers}
              onOpenObject3DImportFiles={(files) =>
                openObject3DImportDialog('add', files)
              }
              onStrokeLayerCreated={(layerId) => {
                setSelectedStrokeTargetLayerId(layerId);
                setSelectedStrokeTargetMode('layer');
              }}
              onHistoryCommandRequestHandled={(requestId) =>
                setHistoryCommandRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onClipboardCommandRequestHandled={(requestId) =>
                setClipboardCommandRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onLayerCommandRequestHandled={(requestId) =>
                setLayerCommandRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onLayerAssetCommandRequestHandled={(requestId) =>
                setLayerAssetCommandRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onDocumentCommandRequestHandled={(requestId) =>
                setDocumentCommandRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onImageDocumentRequestHandled={(requestId) =>
                setImageDocumentRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onImageLayerCommandRequestHandled={(requestId) =>
                setImageLayerCommandRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onImageLayerCommandPendingChange={
                setImageLayerCommandPendingState
              }
              onLayerAssetCommandPendingChange={
                setLayerAssetCommandPendingState
              }
              onProjectFileRequestHandled={(requestId) =>
                setProjectFileRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onProjectFilePendingChange={setProjectFilePendingState}
              onProjectSaveRequestHandled={(requestId) =>
                setProjectSaveRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onTemplateSaveRequestHandled={(requestId) => {
                setTemplateSaveRequest((request) =>
                  request?.id === requestId ? null : request,
                );
                void refreshUserTemplates();
              }}
              onTemplateExportRequestHandled={(requestId) =>
                setTemplateExportRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onTemplateInsertRequestHandled={(requestId) =>
                setTemplateInsertRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onImageExportRequestHandled={(requestId) =>
                setImageExportRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onSaveStatusChange={setSaveStatus}
              onSelectionCommandRequestHandled={(requestId) =>
                setSelectionCommandRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onSelectLayerRequestHandled={(requestId) =>
                setSelectLayerRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onSelectTool={setSelectedTool}
              onUploadRequestHandled={(requestId) =>
                setUploadRequest((request) =>
                  request?.id === requestId ? null : request,
                )
              }
              onZoomChange={setZoomPercentage}
              onSharedDocumentLoaded={updateActiveTabFromSharedDocument}
              projectFileRequest={projectFileRequest}
              projectSaveRequest={projectSaveRequest}
              templateExportRequest={templateExportRequest}
              templateInsertRequest={templateInsertRequest}
              templateSaveRequest={templateSaveRequest}
              selectLayerRequest={selectLayerRequest}
              selectionCommandRequest={selectionCommandRequest}
              selectedShape={selectedShape}
              selectedSelectionMode={selectedSelectionMode}
              selectedStrokeColor={selectedStrokeColor}
              selectedStrokeMode={selectedStrokeMode}
              selectedStrokeStyle={selectedStrokeStyle}
              selectedStrokeTargetLayerId={selectedStrokeTargetLayerId}
              selectedStrokeTargetMode={selectedStrokeTargetMode}
              selectedStrokeWidth={selectedStrokeWidth}
              selectedTool={selectedTool}
              showCanvasBorder={showCanvasBorder}
              uploadRequest={uploadRequest}
            />
          ) : (
            <section
              className=' min-h-0 min-w-0 place-items-center bg-[#101113] p-7 flex overflow-y-auto'
              aria-label='No open documents'
              onDragOver={handleEmptyStateDragOver}
              onDrop={handleEmptyStateDrop}
            >
              <div className='flex-1 flex items-center justify-center'>
                <div className='text-center'>
                  <h2 className='bg-gradient-to-r from-[#4aa391] via-[#6fd6c1] to-[#d9f5ee] bg-clip-text text-6xl font-extrabold tracking-[0.22em] text-transparent'>
                    WEBSTER
                  </h2>
                  <div className='flex flex-col items-center'>
                    <p className='mt-4 max-w-[420px] text-sm font-semibold uppercase tracking-[0.18em] text-[#a7b0b9]'>
                      The next-gen image editor for everyone
                    </p>
                    <p className='mt-6 max-w-[460px] text-[13px] font-semibold leading-[1.65] text-[#9aa1ab]'>
                      Welcome to the free advanced photo editor. Start editing
                      by clicking the Open image button, dropping an image or
                      .webster file, or pasting an image from the clipboard
                      (Ctrl+V).
                    </p>
                  </div>
                </div>
              </div>
              <div className='flex-1 '>
                <div className='grid w-[min(780px,100%)] justify-items-stretch gap-[18px] border-2 border-dotted border-[#276f63] rounded-xl p-8 text-left'>
                  <p className='m-0 text-xs font-extrabold uppercase tracking-normal text-[#8b929b]'>
                    No open documents
                  </p>
                  <h2 className='m-0 text-[34px] font-bold leading-[1.12] text-[#f2f4f7]'>
                    Start a Webster project
                  </h2>
                  <section
                    className='grid gap-3 border-t border-[#30353d] pt-4'
                    aria-label='Local projects'
                  >
                    <h3 className='m-0 text-sm font-extrabold uppercase tracking-[0.12em] text-[#a7b0b9]'>
                      Local projects
                    </h3>
                    <div className='flex flex-wrap gap-3'>
                      <button
                        className='min-w-40 rounded-lg border border-[#4aa391] bg-[#203731] px-[18px] py-3 font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]'
                        onClick={() => setIsNewDocumentDialogOpen(true)}
                        type='button'
                      >
                        New local project
                      </button>
                      <button
                        className='min-w-36 rounded-lg border border-[#4aa391] bg-[#203731] px-[18px] py-3 font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]'
                        onClick={openProjectPickerFromEmptyState}
                        type='button'
                      >
                        Open .webster
                      </button>
                      <button
                        className='min-w-32 rounded-lg border border-[#30353d] bg-[#202329] px-[18px] py-3 font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]'
                        onClick={() => emptyImageInputRef.current?.click()}
                        type='button'
                      >
                        Open image
                      </button>
                    </div>
                  </section>
                  {recentProjectError ? (
                    <p className='m-0 text-[13px] font-bold text-[#ffb9b9]'>
                      {recentProjectError}
                    </p>
                  ) : null}
                  <section
                    className='mb-2 grid justify-items-start gap-3 border-t border-[#30353d] pt-4'
                    aria-label='Cloud projects'
                  >
                    <div className='flex w-full flex-wrap items-center justify-between gap-3'>
                      <h3 className='m-0 text-sm font-extrabold uppercase tracking-[0.12em] text-[#a7b0b9]'>
                        Cloud projects
                      </h3>
                      <button
                        className='rounded-lg border border-[#30353d] bg-[#202329] px-3 py-2 text-[12px] font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]'
                        onClick={openSharedProject}
                        type='button'
                      >
                        Open by ID
                      </button>
                    </div>
                    <HomeProjects
                      onOpenProject={(projectId, projectName) =>
                        openSharedProjectById(projectId, projectName)
                      }
                    />
                  </section>
                  <input
                    ref={emptyImageInputRef}
                    accept='image/*'
                    className='absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]'
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        void openImageAsNewDocument(file);
                        event.target.value = '';
                      }
                    }}
                    type='file'
                  />
                  <input
                    ref={emptyProjectInputRef}
                    accept='.webster,application/zip,application/vnd.webster.project'
                    className='absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]'
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        openProjectInNewTab(file, null);
                        event.target.value = '';
                      }
                    }}
                    type='file'
                  />
                </div>
              </div>
            </section>
          )}
        </div>
        <ResizeHandle
          aria-label='Resize side panels'
          className='max-[760px]:hidden'
          hidden={!activeDocument}
          onPointerDown={startRightPanelResize}
          orientation='vertical'
        />
        <aside
          className={cn(
            'flex min-h-0 flex-col overflow-x-hidden overflow-y-auto bg-[#17191d] opacity-100 overscroll-contain transition-[opacity,transform] duration-[220ms] ease-in-out max-[760px]:col-[1/-1] max-[760px]:row-start-2 max-[760px]:grid max-[760px]:grid-cols-3 max-[760px]:grid-rows-[220px] max-[760px]:overflow-x-auto max-[760px]:overflow-y-hidden max-[760px]:border-t max-[760px]:border-[#2a2d31]',
            activeDocument
              ? ''
              : 'pointer-events-none translate-x-3 opacity-0 max-[760px]:col-start-5 max-[760px]:row-start-1',
          )}
          aria-label='Editor panels'
          ref={sidePanelsRef}
        >
          <div
            className={cn(
              'flex-none overflow-hidden max-[760px]:min-h-0',
              collapsedSidePanels.layers
                ? 'h-[42px]'
                : 'h-[var(--layers-panel-height)]',
            )}
          >
            <LayersPanel
              canEditDocument={canEditDocument}
              canGroupSelectedLayers={canGroupSelectedLayers}
              isCollapsed={collapsedSidePanels.layers}
              layers={layers}
              onGroupSelectedLayers={groupSelectedLayers}
              onLayerCommand={runLayerCommand}
              onSelectLayers={(layerIds) =>
                setSelectLayerRequest({ id: Date.now(), layerIds })
              }
              onToggleCollapsed={() => toggleSidePanelCollapsed('layers')}
            />
          </div>
          <ResizeHandle
            aria-label='Resize layers panel'
            className='flex-none max-[760px]:hidden'
            hidden={collapsedSidePanels.layers}
            onPointerDown={startLayersResize}
            orientation='horizontal'
          />
          <div
            className={cn(
              'flex-none overflow-hidden max-[760px]:min-h-0',
              collapsedSidePanels.properties
                ? 'h-[42px]'
                : 'h-[var(--properties-panel-height)]',
            )}
          >
            <PropertiesPanel
              canEditDocument={canEditDocument}
              isCollapsed={collapsedSidePanels.properties}
              importedFontFamilies={[
                ...importedFontFamilies,
                ...textLayerFontFamilies,
              ]}
              onGroupSelectedLayers={groupSelectedLayers}
              onChangeObject3DModel={() => openObject3DImportDialog('replace')}
              onLayerAssetCommand={runLayerAssetCommand}
              onLayerCommand={runLayerCommand}
              onToggleCollapsed={() => toggleSidePanelCollapsed('properties')}
              selectedLayer={selectedLayer}
              selectedLayers={selectedLayers}
              selectedTool={selectedTool}
            />
          </div>
          <ResizeHandle
            aria-label='Resize properties panel'
            className='flex-none max-[760px]:hidden'
            hidden={collapsedSidePanels.properties}
            onPointerDown={startPropertiesResize}
            orientation='horizontal'
          />
          <div
            className={cn(
              'flex-none overflow-hidden max-[760px]:min-h-0',
              collapsedSidePanels.versions ? 'h-[42px]' : 'h-[248px]',
            )}
          >
            <VersionHistoryPanel
              capabilities={sharedProjectState.capabilities}
              currentVersion={sharedProjectState.currentVersion}
              isCollapsed={collapsedSidePanels.versions}
              isSharedMode={sharedProjectState.mode === 'shared'}
              onCreateSnapshot={createSharedSnapshot}
              onDownloadWebster={downloadSharedProject}
              onRefreshSnapshots={refreshSharedSnapshots}
              onRestoreSnapshot={restoreSharedSnapshot}
              onToggleCollapsed={() => toggleSidePanelCollapsed('versions')}
              pendingCommitCount={sharedProjectState.pendingCommitCount}
              projectId={sharedProjectState.projectId}
              role={sharedProjectState.role}
              snapshots={sharedProjectState.snapshots}
              users={sharedProjectState.users}
            />
          </div>
          <div
            className={cn(
              'flex-none overflow-hidden',
              collapsedSidePanels.history ? 'h-[42px]' : '',
            )}
          >
            <HistoryPanel
              entries={activeHistoryState.entries}
              isCollapsed={collapsedSidePanels.history}
              onToggleCollapsed={() => toggleSidePanelCollapsed('history')}
            />
          </div>
        </aside>
      </section>
      {isNewDocumentDialogOpen ? (
        <NewDocumentDialog
          onClose={() => setIsNewDocumentDialogOpen(false)}
          onCreate={createDocumentTab}
          onCreateFromUserTemplate={(template) =>
            void createDocumentFromUserTemplate(template)
          }
          onDeleteUserTemplate={(template) => void deleteUserTemplate(template)}
          onExportUserTemplate={(template) => void exportUserTemplate(template)}
          onImportUserTemplate={(file) => void importUserTemplateFile(file)}
          onInsertUserTemplate={(template) => void insertUserTemplate(template)}
          onRenameUserTemplate={(template, name) =>
            void renameUserTemplate(template, name)
          }
          canInsertUserTemplate={Boolean(activeDocument)}
          userTemplates={userTemplates}
        />
      ) : null}
      {isObject3DImportDialogOpen ? (
        <Object3DImportDialog
          initialFiles={object3DImportInitialFiles}
          onClose={() => {
            setIsObject3DImportDialogOpen(false);
            setLayerAssetCommandPendingState(null);
            setObject3DImportInitialFiles([]);
            setObject3DImportMode('add');
          }}
          onUseModel={useLoadedObject3DModel}
          replaceLayerName={
            object3DImportMode === 'replace' &&
            selectedObject3DLayer &&
            !selectedObject3DLayer.locked
              ? selectedObject3DLayer.name
              : null
          }
        />
      ) : null}
      {isResizeCanvasDialogOpen && activeDocument ? (
        <ResizeCanvasDialog
          height={activeDocument.height}
          onClose={() => setIsResizeCanvasDialogOpen(false)}
          onResize={({ anchor, height, width }) => {
            setTabs((currentTabs) =>
              currentTabs.map((tab) =>
                tab.id === activeDocument.id
                  ? {
                      ...tab,
                      height,
                      width,
                    }
                  : tab,
              ),
            );
            setDocumentCommandRequest({
              command: {
                anchor,
                height,
                type: 'resize',
                width,
              },
              id: Date.now(),
            });
            setIsResizeCanvasDialogOpen(false);
          }}
          width={activeDocument.width}
        />
      ) : null}
      {isResizeImageDialogOpen && selectedImageLayer ? (
        <ResizeImageDialog
          canRestoreOriginalPixels={selectedImageLayer.canRestoreOriginalPixels}
          height={selectedImageLayer.imagePixelHeight}
          layerName={selectedImageLayer.name}
          onClose={() => setIsResizeImageDialogOpen(false)}
          onResize={({ height, width }) => {
            setImageLayerCommandRequest({
              command: {
                height,
                layerId: selectedImageLayer.id,
                type: 'resample',
                width,
              },
              id: Date.now(),
            });
            setIsResizeImageDialogOpen(false);
          }}
          onRestoreOriginal={() => {
            setImageLayerCommandRequest({
              command: {
                layerId: selectedImageLayer.id,
                type: 'restore-original',
              },
              id: Date.now(),
            });
            setIsResizeImageDialogOpen(false);
          }}
          originalHeight={selectedImageLayer.originalImagePixelHeight}
          originalWidth={selectedImageLayer.originalImagePixelWidth}
          width={selectedImageLayer.imagePixelWidth}
        />
      ) : null}
      {isExportImageDialogOpen ? (
        <ExportImageDialog
          onClose={() => setIsExportImageDialogOpen(false)}
          onExport={({ background, format }) => {
            setImageExportRequest({
              background,
              format,
              id: Date.now(),
              title: activeDocument?.title ?? 'untitled',
            });
            setIsExportImageDialogOpen(false);
          }}
        />
      ) : null}
      {isShareProjectDialogOpen &&
      sharedProjectState.mode === 'shared' &&
      sharedProjectState.projectId ? (
        <ShareProjectDialog
          onClose={() => setIsShareProjectDialogOpen(false)}
          projectId={sharedProjectState.projectId}
        />
      ) : null}
      {isUploadSharePromptOpen ? (
        <div
          aria-modal='true'
          className='fixed inset-0 z-40 grid place-items-center bg-[#050607]/72 p-6 backdrop-blur-md'
          role='dialog'
        >
          <div className='grid w-[min(420px,100%)] gap-4 rounded-lg border border-[#383e46] bg-[#17191d] p-5 shadow-[0_24px_48px_rgba(0,0,0,0.42)]'>
            <div>
              <h2 className='m-0 text-lg font-bold text-[#f2f4f7]'>
                Upload & share
              </h2>
              <p className='m-0 mt-2 text-[13px] font-bold leading-5 text-[#a7b0b9]'>
                This project is local only. Upload it to cloud to invite people.
              </p>
            </div>
            <div className='flex justify-end gap-2'>
              <button
                className='rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4c535c] hover:bg-[#252930]'
                onClick={() => setIsUploadSharePromptOpen(false)}
                type='button'
              >
                Cancel
              </button>
              <button
                className='rounded-lg border border-[#4aa391] bg-[#203731] px-3 py-2 font-bold text-[#eef1f4] hover:bg-[#25453e]'
                onClick={uploadLocalProjectAndContinueSharing}
                type='button'
              >
                Upload & continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {authPrompt ? (
        <div
          aria-modal='true'
          className='fixed inset-0 z-40 grid place-items-center bg-[#050607]/72 p-6 backdrop-blur-md'
          role='dialog'
        >
          <div className='grid w-[min(420px,100%)] gap-4 rounded-lg border border-[#383e46] bg-[#17191d] p-5 shadow-[0_24px_48px_rgba(0,0,0,0.42)]'>
            <div>
              <h2 className='m-0 text-lg font-bold text-[#f2f4f7]'>
                Sign in required
              </h2>
              <p className='m-0 mt-2 text-[13px] font-bold leading-5 text-[#a7b0b9]'>
                {authPrompt.type === 'share-local'
                  ? 'Sign in to upload and share this project.'
                  : authPrompt.type === 'invite'
                    ? 'Sign in to accept this invite.'
                    : 'Sign in to open this cloud project.'}
              </p>
            </div>
            <div className='flex justify-end gap-2'>
              <button
                className='rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4c535c] hover:bg-[#252930]'
                onClick={cancelCloudAuthPrompt}
                type='button'
              >
                {authPrompt.type === 'share-local' ? 'Cancel' : 'Continue local'}
              </button>
              <button
                className='rounded-lg border border-[#4aa391] bg-[#203731] px-3 py-2 font-bold text-[#eef1f4] hover:bg-[#25453e]'
                onClick={() => void signInForCloudAction()}
                type='button'
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {layerAssetCommandPendingState ? (
        <ProgressOverlay state={layerAssetCommandPendingState} />
      ) : null}
      {projectFilePendingState ? (
        <ProgressOverlay state={projectFilePendingState} />
      ) : null}
      {imageLayerCommandPendingState ? (
        <ImageLayerCommandOverlay state={imageLayerCommandPendingState} />
      ) : null}
      {sharedProjectState.error ? (
        <div
          className='fixed bottom-4 left-1/2 z-50 m-0 grid max-w-[min(560px,calc(100vw-32px))] -translate-x-1/2 justify-items-center gap-2 rounded-lg border border-[#b96a6a] bg-[rgba(28,20,20,0.96)] px-4 py-3 text-center text-[13px] font-bold text-[#ffd0d0] shadow-[0_18px_36px_rgba(0,0,0,0.42)]'
          role='status'
        >
          <span>{sharedProjectState.error}</span>
          {sharedProjectState.errorRequiresUpgrade ? (
            <a
              className='rounded-4xl border border-[#4aa391] bg-[#203731] px-4 py-1.5 font-extrabold text-[#eef1f4]'
              href='/billing'
            >
              Upgrade
            </a>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function ProgressOverlay({
  state,
}: {
  state: {
    message: string;
    progress: number;
    status?: 'complete' | 'error' | 'importing' | 'loading' | 'saving';
    title: string;
  };
}) {
  const progress = Math.max(0, Math.min(100, Math.round(state.progress)));
  const barColor = state.status === 'error' ? '#e76f6f' : '#4aa391';

  return (
    <div
      aria-live='polite'
      aria-modal='true'
      className='fixed inset-0 z-50 grid place-items-center bg-[#050607]/72 p-6 backdrop-blur-md'
      role='dialog'
    >
      <div className='grid w-[min(420px,100%)] gap-4 rounded-xl border border-[#3a414a] bg-[rgba(23,25,29,0.98)] px-5 py-5 shadow-[0_24px_48px_rgba(0,0,0,0.48)]'>
        <div>
          <div className='mb-2 flex items-center justify-between gap-3'>
            <p className='m-0 text-[15px] font-extrabold text-[#f2f4f7]'>
              {state.title}
            </p>
            <strong className='text-xs font-extrabold text-[#cfd4da]'>
              {progress}%
            </strong>
          </div>
          <div className='h-2 overflow-hidden rounded-full bg-[#111418]'>
            <div
              className='h-full rounded-full transition-[width] duration-200'
              style={{ backgroundColor: barColor, width: `${progress}%` }}
            />
          </div>
        </div>
        <p className='m-0 text-xs font-bold text-[#9aa1ab]'>{state.message}</p>
      </div>
    </div>
  );
}

function ImageLayerCommandOverlay({
  state,
}: {
  state: ImageLayerCommandPendingState;
}) {
  return (
    <div
      aria-live='polite'
      aria-modal='true'
      className='fixed inset-0 z-50 grid place-items-center bg-[#050607]/72 p-6 backdrop-blur-md'
      role='dialog'
    >
      <div className='grid w-[min(360px,100%)] justify-items-center gap-3 rounded-xl border border-[#3a414a] bg-[rgba(23,25,29,0.98)] px-5 py-5 text-center shadow-[0_24px_48px_rgba(0,0,0,0.48)]'>
        <span
          className='h-9 w-9 animate-spin rounded-full border-2 border-[#4aa391] border-t-transparent'
          aria-hidden='true'
        />
        <div>
          <p className='m-0 text-[15px] font-extrabold text-[#f2f4f7]'>
            {state.title}
          </p>
          <p className='m-0 mt-1 text-xs font-bold text-[#8b929b]'>
            {state.message}
          </p>
        </div>
      </div>
    </div>
  );
}

function getOpenableFile(files: FileList) {
  return (
    Array.from(files).find(
      (file) => isImageFile(file) || isWebsterProjectFile(file),
    ) ?? null
  );
}

function hasOpenableDragData(dataTransfer: DataTransfer) {
  if (getOpenableFile(dataTransfer.files)) {
    return true;
  }

  return Array.from(dataTransfer.items).some((item) => item.kind === 'file');
}

function getPastedImageFile(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items ?? []);
  const imageItem = items.find(
    (item) => item.kind === 'file' && item.type.startsWith('image/'),
  );
  const imageFile = imageItem?.getAsFile();

  if (imageFile) {
    return imageFile;
  }

  return Array.from(event.clipboardData?.files ?? []).find(isImageFile) ?? null;
}

function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

function isWebsterProjectFile(file: File) {
  return (
    file.name.toLowerCase().endsWith('.webster') ||
    file.type === 'application/vnd.webster.project'
  );
}

function isEditableEventTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]'),
  );
}

function isImageLayerSummary(
  layer: LayerSummary | null,
): layer is LayerSummary & {
  canRestoreOriginalPixels: boolean;
  imagePixelHeight: number;
  imagePixelWidth: number;
  originalImagePixelHeight: number;
  originalImagePixelWidth: number;
} {
  return Boolean(layer && layer.type === 'image' && 'imagePixelWidth' in layer);
}

function isObject3DLayerSummary(layer: LayerSummary | null) {
  return Boolean(layer && layer.type === 'object3d');
}

function hasSelectedAncestorLayer(
  layer: LayerSummary,
  layers: LayerSummary[],
  selectedLayerIds: Set<string>,
) {
  const visitedGroupIds = new Set<string>();
  let groupId = layer.groupId;

  while (groupId && !visitedGroupIds.has(groupId)) {
    if (selectedLayerIds.has(groupId)) {
      return true;
    }

    visitedGroupIds.add(groupId);
    groupId =
      layers.find((candidate) => candidate.id === groupId)?.groupId ?? null;
  }

  return false;
}

function getProjectStorageLabel(
  activeDocument: EditorDocumentTab | null,
  sharedProjectState: SharedProjectUiState,
) {
  if (sharedProjectState.mode === 'shared') {
    return sharedProjectState.role === 'owner'
      ? 'My cloud project'
      : 'Shared with me';
  }

  return activeDocument?.source === 'local-file' ? 'Local file' : 'Local only';
}

function loadImageDimensions(file: File) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    function cleanup() {
      URL.revokeObjectURL(objectUrl);
    }

    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      cleanup();

      if (width > 0 && height > 0) {
        resolve({ height, width });
        return;
      }

      reject(new Error('Image has no dimensions.'));
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('Unable to load image dimensions.'));
    };
    image.src = objectUrl;
  });
}

function getProjectFilename(title: string) {
  const safeTitle = (title.trim() || 'untitled').replace(
    /[<>:"/\\|?*\u0000-\u001f]/g,
    '-',
  );

  return safeTitle.toLowerCase().endsWith('.webster')
    ? safeTitle
    : `${safeTitle}.webster`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getDefaultStrokeWidth(style: StrokeStyle) {
  switch (style) {
    case 'brush':
      return 14;
    case 'highlighter':
      return 30;
    case 'marker':
      return 22;
    case 'pen':
      return 6;
    case 'pencil':
      return 3;
  }
}

function getDefaultStrokeColor(
  style: StrokeStyle,
): [number, number, number, number] {
  switch (style) {
    case 'brush':
      return [0.05, 0.06, 0.07, 0.88];
    case 'highlighter':
      return [1, 0.78, 0.22, 0.36];
    case 'marker':
      return [0.1, 0.42, 0.88, 0.95];
    case 'pen':
      return [0.07, 0.08, 0.09, 1];
    case 'pencil':
      return [0.07, 0.08, 0.09, 0.82];
  }
}

function ResizeHandle({
  className,
  hidden,
  onPointerDown,
  orientation,
  ...buttonProps
}: {
  'aria-label': string;
  className?: string;
  hidden?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  orientation: 'horizontal' | 'vertical';
}) {
  return (
    <button
      className={cn(
        'group relative z-[3] border-0 bg-[#2a2d31] p-0 opacity-100 transition-[background,opacity] duration-150 hover:bg-[#39404a] focus-visible:bg-[#39404a] [.is-resizing-editor_&]:bg-[#39404a]',
        hidden && 'pointer-events-none opacity-0',
        orientation === 'vertical'
          ? 'w-1.5 cursor-col-resize'
          : 'h-1.5 cursor-row-resize',
        className,
      )}
      onPointerDown={onPointerDown}
      type='button'
      {...buttonProps}
    >
      <span
        className={cn(
          'absolute rounded-full bg-[#777f8a] opacity-0 transition-opacity duration-150 group-hover:opacity-100',
          orientation === 'vertical'
            ? 'left-0.5 top-1/2 h-9 w-0.5 -translate-y-1/2'
            : 'left-1/2 top-0.5 h-0.5 w-[42px] -translate-x-1/2',
        )}
        aria-hidden='true'
      />
    </button>
  );
}
