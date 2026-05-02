"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type {
  DocumentCommand,
  EditorClipboardCommand,
  HistoryStateSnapshot,
  ImageExportBackground,
  ImageExportFormat,
  ImageLayerCommand,
  LayerCommand,
  LayerSummary,
  SelectionCommand
} from "@/editor/app/EditorApp";
import type { MaskBrushOptions } from "../tools/mask-brush/MaskBrushTypes";
import type { ShapeKind } from "../layers/ShapeLayer";
import type { StrokeStyle } from "../layers/StrokeLayer";
import type { SelectionMode } from "../selection/SelectionManager";
import {
  canPickProjectFileHandle,
  pickProjectFileWithHandle
} from "../projects/projectFiles";
import type { WebsterFileHandle } from "../projects/projectFiles";
import {
  listRememberedProjectFiles,
  readRememberedProjectFileHandle
} from "../projects/projectFileHandleStore";
import type { RecentProjectHandle } from "../projects/projectFileHandleStore";
import {
  builtInProjectTemplates,
  deleteUserProjectTemplate,
  getUserProjectTemplate,
  importUserProjectTemplate,
  listUserProjectTemplates,
  renameUserProjectTemplate
} from "../projects/projectTemplates";
import type { UserProjectTemplateSummary } from "../projects/projectTemplates";
import type { SaveStatus } from "./hooks/useProjectFileActions";
import { CanvasView } from "./CanvasView";
import { cn } from "./classNames";
import type { EditorDocumentTab, NewDocumentSize } from "./editorDocuments";
import type { ImageLayerCommandPendingState } from "./hooks/useEditorSceneRequests";
import { HistoryPanel } from "./panels/HistoryPanel";
import { LayersPanel } from "./panels/LayersPanel";
import { ExportImageDialog } from "./dialogs/ExportImageDialog";
import { NewDocumentDialog } from "./dialogs/NewDocumentDialog";
import { ResizeCanvasDialog } from "./dialogs/ResizeCanvasDialog";
import { ResizeImageDialog } from "./dialogs/ResizeImageDialog";
import { PropertiesPanel } from "./panels/PropertiesPanel";
import { TabsBar } from "./toolbar/TabsBar";
import { Toolbar } from "./toolbar/Toolbar";
import { ToolsPanel } from "./toolbar/ToolsPanel";
import type { ToolDefinition } from "./toolbar/ToolsPanel";

const initialTabs: EditorDocumentTab[] = [];

const editorTools: ToolDefinition[] = [
  {
    description: "Pick, move, and transform layers.",
    icon: "M",
    label: "Move",
    value: "Move"
  },
  {
    description: "Drag the workspace without editing artwork.",
    icon: "P",
    label: "Pan",
    value: "Pan"
  },
  {
    description: "Paint the selected layer mask.",
    icon: "B",
    label: "Mask Brush",
    value: "Mask Brush"
  },
  {
    description: "Click the canvas to place and edit live text.",
    icon: "T",
    label: "Text",
    value: "Text"
  },
  {
    description: "Sketch freehand strokes with pencils and brushes.",
    icon: "D",
    label: "Draw",
    value: "Draw"
  },
  {
    description: "Draw rectangles, circles, arrows, and polygons.",
    icon: "S",
    label: "Shape",
    value: "Shape"
  },
  {
    description: "Drag a box selection.",
    icon: "R",
    label: "Rectangle Select",
    value: "Rectangle Select"
  },
  {
    description: "Drag an oval selection.",
    icon: "E",
    label: "Ellipse Select",
    value: "Ellipse Select"
  },
  {
    description: "Draw a freehand selection.",
    icon: "L",
    label: "Lasso Select",
    value: "Lasso Select"
  },
  {
    description: "Pick similar image colors.",
    icon: "W",
    label: "Magic Select",
    value: "Magic Select"
  }
];

const initialLayers: LayerSummary[] = [];
const documentPresets: Array<NewDocumentSize & { label: string }> =
  builtInProjectTemplates.map((template) => ({
    height: template.height,
    label: `${template.name} ${template.width} x ${template.height}`,
    width: template.width
  }));
const layersPanelMinHeight = 170;
const propertiesPanelMinHeight = 260;
const historyPanelMinHeight = 72;
const sidePanelHandleHeight = 12;
const collapsedSidePanelHeight = 42;

type SidePanelId = "history" | "layers" | "properties";

type EditorLayoutVars = CSSProperties & {
  "--tools-panel-width": string;
  "--right-panel-width": string;
  "--layers-panel-height": string;
  "--properties-panel-height": string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const emptyHistoryState: HistoryStateSnapshot = {
  canRedo: false,
  canUndo: false,
  entries: [],
  redoLabel: null,
  undoLabel: null
};

export function EditorPage() {
  const emptyImageInputRef = useRef<HTMLInputElement | null>(null);
  const emptyProjectInputRef = useRef<HTMLInputElement | null>(null);
  const sidePanelsRef = useRef<HTMLElement | null>(null);
  const documentCounterRef = useRef(1);
  const [selectedTool, setSelectedTool] = useState("Move");
  const [showCanvasBorder, setShowCanvasBorder] = useState(true);
  const [selectedShape, setSelectedShape] = useState<ShapeKind>("rectangle");
  const [selectedSelectionMode, setSelectedSelectionMode] = useState<SelectionMode>("replace");
  const [magicSelectionTolerance, setMagicSelectionTolerance] = useState(12);
  const [selectedStrokeStyle, setSelectedStrokeStyle] = useState<StrokeStyle>("pencil");
  const [selectedStrokeColor, setSelectedStrokeColor] = useState<[number, number, number, number]>(
    [0.07, 0.08, 0.09, 0.82]
  );
  const [selectedStrokeMode, setSelectedStrokeMode] = useState<"draw" | "erase">("draw");
  const [selectedStrokeTargetLayerId, setSelectedStrokeTargetLayerId] = useState<string | null>(
    null
  );
  const [selectedStrokeTargetMode, setSelectedStrokeTargetMode] = useState<
    "layer" | "new" | "selected"
  >("new");
  const [selectedStrokeWidth, setSelectedStrokeWidth] = useState(3);
  const [maskBrushOptions, setMaskBrushOptions] = useState<MaskBrushOptions>({
    mode: "hide",
    opacity: 1,
    size: 48
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [zoomPercentage, setZoomPercentage] = useState(100);
  const [tabs, setTabs] = useState<EditorDocumentTab[]>(initialTabs);
  const [isExportImageDialogOpen, setIsExportImageDialogOpen] = useState(false);
  const [isNewDocumentDialogOpen, setIsNewDocumentDialogOpen] = useState(false);
  const [isResizeCanvasDialogOpen, setIsResizeCanvasDialogOpen] = useState(false);
  const [isResizeImageDialogOpen, setIsResizeImageDialogOpen] = useState(false);
  const [imageLayerCommandPendingState, setImageLayerCommandPendingState] =
    useState<ImageLayerCommandPendingState | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProjectHandle[]>([]);
  const [recentProjectError, setRecentProjectError] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserProjectTemplateSummary[]>([]);
  const [historyState, setHistoryState] = useState<HistoryStateSnapshot>(emptyHistoryState);
  const [layers, setLayers] = useState<LayerSummary[]>(initialLayers);
  const [uploadRequest, setUploadRequest] = useState<{ file: File; id: number } | null>(null);
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
    mode: "save" | "save-as";
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
    command: "redo" | "undo";
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
  const [closedDocumentRequest, setClosedDocumentRequest] = useState<{
    id: number;
    tabId: string;
  } | null>(null);
  const [toolsPanelWidth, setToolsPanelWidth] = useState(220);
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [layersPanelHeight, setLayersPanelHeight] = useState(280);
  const [propertiesPanelHeight, setPropertiesPanelHeight] = useState(360);
  const [collapsedSidePanels, setCollapsedSidePanels] = useState<Record<SidePanelId, boolean>>({
    history: false,
    layers: false,
    properties: false
  });

  const layoutStyle: EditorLayoutVars = {
    "--tools-panel-width": `${toolsPanelWidth}px`,
    "--right-panel-width": `${rightPanelWidth}px`,
    "--layers-panel-height": `${layersPanelHeight}px`,
    "--properties-panel-height": `${propertiesPanelHeight}px`
  };
  const selectedLayers = layers.filter((layer) => layer.isSelected);
  const selectedLayer = selectedLayers.length === 1 ? selectedLayers[0] : null;
  const selectedLayerIds = new Set(selectedLayers.map((layer) => layer.id));
  const groupableSelectedLayerIds = selectedLayers
    .filter((layer) => !hasSelectedAncestorLayer(layer, layers, selectedLayerIds))
    .map((layer) => layer.id);
  const canGroupSelectedLayers = groupableSelectedLayerIds.length > 1;
  const selectedImageLayer = isImageLayerSummary(selectedLayer) ? selectedLayer : null;
  const activeDocument = tabs.find((tab) => tab.isActive) ?? tabs[0] ?? null;
  const activeHistoryState = activeDocument ? historyState : emptyHistoryState;
  const strokeLayers = layers.filter((layer) => layer.type === "stroke");

  useEffect(() => {
    if (
      selectedStrokeTargetMode === "layer" &&
      selectedStrokeTargetLayerId &&
      !strokeLayers.some((layer) => layer.id === selectedStrokeTargetLayerId)
    ) {
      setSelectedStrokeTargetLayerId(null);
      setSelectedStrokeTargetMode("new");
    }
  }, [selectedStrokeTargetLayerId, selectedStrokeTargetMode, strokeLayers]);

  useEffect(() => {
    if (!activeDocument) {
      setHistoryState(emptyHistoryState);
    }
  }, [activeDocument]);

  useEffect(() => {
    let didCancel = false;

    async function loadRecentProjects() {
      const [projects, templates] = await Promise.all([
        listRememberedProjectFiles().catch(() => []),
        listUserProjectTemplates().catch(() => [])
      ]);

      if (!didCancel) {
        setRecentProjects(projects);
        setUserTemplates(templates);
      }
    }

    void loadRecentProjects();

    return () => {
      didCancel = true;
    };
  }, [tabs.length]);

  function runLayerCommand(command: LayerCommand) {
    setLayerCommandRequest({ command, id: Date.now() });
  }

  function runClipboardCommand(command: EditorClipboardCommand) {
    setClipboardCommandRequest({ command, id: Date.now() });
  }

  function groupSelectedLayers() {
    if (groupableSelectedLayerIds.length < 2) {
      return;
    }

    runLayerCommand({
      layerIds: groupableSelectedLayerIds,
      name: "Group",
      type: "group"
    });
  }

  async function refreshUserTemplates() {
    setUserTemplates(await listUserProjectTemplates().catch(() => []));
  }

  function activateTab(tabId: string) {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => ({
        ...tab,
        isActive: tab.id === tabId
      }))
    );
  }

  function createDocumentTab(size: NewDocumentSize) {
    documentCounterRef.current += 1;

    const tab: EditorDocumentTab = {
      height: size.height,
      id: `document-${documentCounterRef.current}`,
      isActive: true,
      title: `Untitled ${documentCounterRef.current}`,
      width: size.width
    };

    setTabs((currentTabs) => [
      ...currentTabs.map((currentTab) => ({ ...currentTab, isActive: false })),
      tab
    ]);
    setImageDocumentRequest(null);
    setIsNewDocumentDialogOpen(false);
  }

  async function createDocumentFromUserTemplate(template: UserProjectTemplateSummary) {
    const storedTemplate = await getUserProjectTemplate(template.id);

    if (!storedTemplate) {
      window.alert("Template is no longer available.");
      await refreshUserTemplates();
      return;
    }

    documentCounterRef.current += 1;

    const title = storedTemplate.name || `Template ${documentCounterRef.current}`;
    const tab: EditorDocumentTab = {
      height: storedTemplate.height,
      id: `document-${documentCounterRef.current}`,
      isActive: true,
      title,
      width: storedTemplate.width
    };

    setTabs((currentTabs) => [
      ...currentTabs.map((currentTab) => ({ ...currentTab, isActive: false })),
      tab
    ]);
    setTemplateInsertRequest({
      file: new File([storedTemplate.projectBlob], getProjectFilename(title), {
        type: "application/vnd.webster.project"
      }),
      id: Date.now(),
      name: storedTemplate.name,
      tabId: tab.id
    });
    setRecentProjectError(null);
    setIsNewDocumentDialogOpen(false);
  }

  async function renameUserTemplate(template: UserProjectTemplateSummary, name: string) {
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
      window.alert("Unable to import template. Please choose a valid .webster project file.");
    }
  }

  async function exportUserTemplate(template: UserProjectTemplateSummary) {
    const storedTemplate = await getUserProjectTemplate(template.id);

    if (!storedTemplate) {
      window.alert("Template is no longer available.");
      await refreshUserTemplates();
      return;
    }

    downloadBlob(storedTemplate.projectBlob, getProjectFilename(storedTemplate.name));
  }

  async function insertUserTemplate(template: UserProjectTemplateSummary) {
    const storedTemplate = await getUserProjectTemplate(template.id);

    if (!activeDocument) {
      await createDocumentFromUserTemplate(template);
      return;
    }

    if (!storedTemplate) {
      window.alert("Template is no longer available.");
      await refreshUserTemplates();
      return;
    }

    setTemplateInsertRequest({
      file: new File([storedTemplate.projectBlob], getProjectFilename(storedTemplate.name), {
        type: "application/vnd.webster.project"
      }),
      id: Date.now(),
      name: storedTemplate.name,
      tabId: activeDocument.id
    });
    setIsNewDocumentDialogOpen(false);
  }

  function saveCurrentProjectAsTemplate() {
    const name = window.prompt("Template name", activeDocument?.title ?? "Template");

    if (name === null) {
      return;
    }

    setTemplateSaveRequest({
      id: Date.now(),
      name
    });
  }

  function exportCurrentProjectAsTemplate() {
    const name = window.prompt("Template name", activeDocument?.title ?? "Template");

    if (name === null) {
      return;
    }

    setTemplateExportRequest({
      id: Date.now(),
      name
    });
  }

  function closeDocumentTab(tabId: string) {
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
        isActive: index === nextActiveIndex
      }));
    });
    setClosedDocumentRequest({ id: Date.now(), tabId });
  }

  function renameDocumentTab(tabId: string, title: string) {
    const currentTab = tabs.find((tab) => tab.id === tabId);
    const nextTitle = title.trim() || "Untitled";

    if (!currentTab || currentTab.title === nextTitle) {
      return;
    }

    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              title: nextTitle
            }
          : tab
      )
    );

    if (
      currentTab.isActive &&
      window.confirm(`Save this project as "${getProjectFilename(nextTitle)}"?`)
    ) {
      setProjectSaveRequest({ id: Date.now(), mode: "save-as" });
    }
  }

  function openProjectInNewTab(file: File, handle?: WebsterFileHandle | null) {
    documentCounterRef.current += 1;

    const tab: EditorDocumentTab = {
      height: 800,
      id: `document-${documentCounterRef.current}`,
      isActive: true,
      title: file.name.replace(/\.webster$/i, "") || `Untitled ${documentCounterRef.current}`,
      width: 1200
    };

    setTabs((currentTabs) => [
      ...currentTabs.map((currentTab) => ({ ...currentTab, isActive: false })),
      tab
    ]);
    setProjectFileRequest({
      file,
      handle,
      id: Date.now(),
      tabId: tab.id
    });
    setRecentProjectError(null);
  }

  async function openImageAsNewDocument(file: File) {
    try {
      const dimensions = await loadImageDimensions(file);

      documentCounterRef.current += 1;

      const title = file.name.replace(/\.[^.]+$/u, "") || `Image ${documentCounterRef.current}`;
      const tab: EditorDocumentTab = {
        height: dimensions.height,
        id: `document-${documentCounterRef.current}`,
        isActive: true,
        title,
        width: dimensions.width
      };

      setTabs((currentTabs) => [
        ...currentTabs.map((currentTab) => ({ ...currentTab, isActive: false })),
        tab
      ]);
      setImageDocumentRequest({
        file,
        id: Date.now(),
        tabId: tab.id
      });
      setRecentProjectError(null);
    } catch {
      setRecentProjectError("Unable to open image.");
    }
  }

  async function openProjectHandle(handle: WebsterFileHandle | null) {
    try {
      if (!handle?.getFile) {
        setRecentProjectError("No recent project is saved in this browser yet.");
        return;
      }

      const permission = handle.queryPermission
        ? await handle.queryPermission({ mode: "read" })
        : "granted";
      const grantedPermission =
        permission === "granted" ||
        (handle.requestPermission
          ? (await handle.requestPermission({ mode: "read" })) === "granted"
          : false);

      if (!grantedPermission) {
        setRecentProjectError("Browser permission is needed to reopen the recent project.");
        return;
      }

      openProjectInNewTab(await handle.getFile(), handle);
    } catch {
      setRecentProjectError("Unable to open the recent project.");
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
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRecentProjectError("Unable to open project.");
        return;
      }
    }

    emptyProjectInputRef.current?.click();
  }

  function getSidePanelHeight() {
    return sidePanelsRef.current?.getBoundingClientRect().height ?? window.innerHeight - 64;
  }

  function getMaxLayersPanelHeight() {
    return Math.max(
      layersPanelMinHeight,
      getSidePanelHeight() -
        getPanelHeightForResize("properties", propertiesPanelHeight, propertiesPanelMinHeight) -
        getPanelHeightForResize("history", historyPanelMinHeight, historyPanelMinHeight) -
        sidePanelHandleHeight
    );
  }

  function getMaxPropertiesPanelHeight() {
    return Math.max(
      propertiesPanelMinHeight,
      getSidePanelHeight() -
        getPanelHeightForResize("layers", layersPanelHeight, layersPanelMinHeight) -
        getPanelHeightForResize("history", historyPanelMinHeight, historyPanelMinHeight) -
        sidePanelHandleHeight
    );
  }

  function getPanelHeightForResize(id: SidePanelId, height: number, minHeight: number) {
    return collapsedSidePanels[id] ? collapsedSidePanelHeight : Math.max(height, minHeight);
  }

  function toggleSidePanelCollapsed(id: SidePanelId) {
    setCollapsedSidePanels((currentPanels) => ({
      ...currentPanels,
      [id]: !currentPanels[id]
    }));
  }

  function startResize(onMove: (moveEvent: PointerEvent) => void) {
    document.body.classList.add("is-resizing-editor");

    function stopResize() {
      document.body.classList.remove("is-resizing-editor");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  function startToolsResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startX = event.clientX;
    const startWidth = toolsPanelWidth;

    function resize(moveEvent: PointerEvent) {
      setToolsPanelWidth(clamp(startWidth + moveEvent.clientX - startX, 150, 280));
    }

    startResize(resize);
  }

  function startRightPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startX = event.clientX;
    const startWidth = rightPanelWidth;

    function resize(moveEvent: PointerEvent) {
      setRightPanelWidth(clamp(startWidth - (moveEvent.clientX - startX), 320, 760));
    }

    startResize(resize);
  }

  function startLayersResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startY = event.clientY;
    const startHeight = layersPanelHeight;

    function resize(moveEvent: PointerEvent) {
      setLayersPanelHeight(
        clamp(startHeight + moveEvent.clientY - startY, layersPanelMinHeight, getMaxLayersPanelHeight())
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
          getMaxPropertiesPanelHeight()
        )
      );
    }

    startResize(resize);
  }

  return (
    <main className="grid h-screen min-h-0 grid-rows-[64px_1fr] overflow-hidden bg-[#101113] text-[13px] text-[#e7e9ec] min-[1400px]:text-[14px] max-[760px]:h-[100svh] max-[760px]:grid-rows-[118px_1fr]">
      <Toolbar
        canEditDocument={Boolean(activeDocument)}
        canGroupSelectedLayers={canGroupSelectedLayers}
        canRedo={activeHistoryState.canRedo}
        canUndo={activeHistoryState.canUndo}
        canvasSize={
          activeDocument
            ? {
                height: activeDocument.height,
                width: activeDocument.width
              }
            : null
        }
        documentTitle={activeDocument?.title ?? "No document"}
        onCopy={() => runClipboardCommand("copy")}
        onCut={() => runClipboardCommand("cut")}
        onDeleteSelectedLayer={() => {
          if (selectedLayer) {
            runLayerCommand({ layerId: selectedLayer.id, type: "delete" });
          }
        }}
        onDuplicateSelectedLayer={() => {
          if (selectedLayer) {
            runLayerCommand({ layerId: selectedLayer.id, type: "duplicate" });
          }
        }}
        onGroupSelectedLayers={groupSelectedLayers}
        onNewDocument={() => setIsNewDocumentDialogOpen(true)}
        onOpenCanvasResize={() => setIsResizeCanvasDialogOpen(true)}
        onOpenExportDialog={() => setIsExportImageDialogOpen(true)}
        onOpenImageResize={() => setIsResizeImageDialogOpen(true)}
        onOpenProject={openProjectInNewTab}
        onPaste={() => runClipboardCommand("paste")}
        onOpenImageDocument={(file) => void openImageAsNewDocument(file)}
        onRedo={() => setHistoryCommandRequest({ command: "redo", id: Date.now() })}
        onRestoreImageOriginal={() => {
          if (!selectedImageLayer) {
            return;
          }

          setImageLayerCommandRequest({
            command: {
              layerId: selectedImageLayer.id,
              type: "restore-original"
            },
            id: Date.now()
          });
        }}
        onSaveAsProject={() => setProjectSaveRequest({ id: Date.now(), mode: "save-as" })}
        onSaveProject={() => setProjectSaveRequest({ id: Date.now(), mode: "save" })}
        onExportTemplate={exportCurrentProjectAsTemplate}
        onSaveTemplate={saveCurrentProjectAsTemplate}
        onAddAdjustmentLayer={() => runLayerCommand({ type: "add-adjustment" })}
        onSelectionCommand={(command) => setSelectionCommandRequest({ command, id: Date.now() })}
        onSelectionModeChange={setSelectedSelectionMode}
        onSelectTool={setSelectedTool}
        onShowCanvasBorderChange={setShowCanvasBorder}
        onUndo={() => setHistoryCommandRequest({ command: "undo", id: Date.now() })}
        onUploadImage={(file) => setUploadRequest({ file, id: Date.now() })}
        maskBrushOptions={maskBrushOptions}
        onMaskBrushOptionsChange={(options) =>
          setMaskBrushOptions((currentOptions) => ({
            ...currentOptions,
            ...options
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
        onStrokeWidthChange={(width) => setSelectedStrokeWidth(Math.max(1, width || 1))}
        saveStatus={saveStatus}
        selectedLayer={selectedLayer}
        selectedSelectionMode={selectedSelectionMode}
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
          "grid min-h-0 transition-[grid-template-columns] duration-[220ms] ease-in-out",
          activeDocument ? "has-document" : "has-no-document",
          activeDocument
            ? "grid-cols-[var(--tools-panel-width)_6px_minmax(360px,1fr)_6px_var(--right-panel-width)] max-[980px]:grid-cols-[minmax(150px,var(--tools-panel-width))_6px_minmax(300px,1fr)_6px_minmax(280px,var(--right-panel-width))] max-[760px]:grid-cols-[68px_6px_minmax(0,1fr)] max-[760px]:grid-rows-[minmax(0,1fr)_220px]"
            : "grid-cols-[0_0_minmax(360px,1fr)_0_0] max-[980px]:grid-cols-[0_0_minmax(300px,1fr)_0_0] max-[760px]:grid-cols-[0_0_minmax(0,1fr)_0_0]"
        )}
        style={layoutStyle}
        aria-label="Editor workspace"
      >
        <ToolsPanel
          onSelectTool={setSelectedTool}
          onSelectShape={setSelectedShape}
          selectedShape={selectedShape}
          selectedTool={selectedTool}
          tools={editorTools}
        />
        <ResizeHandle
          aria-label="Resize tools panel"
          hidden={!activeDocument}
          onPointerDown={startToolsResize}
          orientation="vertical"
        />
        <div
          className={cn(
            "grid min-h-0 min-w-0 transition-[grid-template-rows] duration-[220ms] ease-in-out",
            activeDocument ? "grid-rows-[42px_1fr]" : "grid-rows-[0_1fr]"
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
              documentCommandRequest={documentCommandRequest}
              historyCommandRequest={historyCommandRequest}
              imageDocumentRequest={imageDocumentRequest}
              imageLayerCommandRequest={imageLayerCommandRequest}
              layerCommandRequest={layerCommandRequest}
              maskBrushOptions={maskBrushOptions}
              magicSelectionTolerance={magicSelectionTolerance}
              imageExportRequest={imageExportRequest}
              onHistoryChange={setHistoryState}
              onLayersChange={setLayers}
              onStrokeLayerCreated={(layerId) => {
                setSelectedStrokeTargetLayerId(layerId);
                setSelectedStrokeTargetMode("layer");
              }}
              onHistoryCommandRequestHandled={(requestId) =>
                setHistoryCommandRequest((request) => (request?.id === requestId ? null : request))
              }
              onClipboardCommandRequestHandled={(requestId) =>
                setClipboardCommandRequest((request) =>
                  request?.id === requestId ? null : request
                )
              }
              onLayerCommandRequestHandled={(requestId) =>
                setLayerCommandRequest((request) => (request?.id === requestId ? null : request))
              }
              onDocumentCommandRequestHandled={(requestId) =>
                setDocumentCommandRequest((request) =>
                  request?.id === requestId ? null : request
                )
              }
              onImageDocumentRequestHandled={(requestId) =>
                setImageDocumentRequest((request) => (request?.id === requestId ? null : request))
              }
              onImageLayerCommandRequestHandled={(requestId) =>
                setImageLayerCommandRequest((request) =>
                  request?.id === requestId ? null : request
                )
              }
              onImageLayerCommandPendingChange={setImageLayerCommandPendingState}
              onProjectFileRequestHandled={(requestId) =>
                setProjectFileRequest((request) => (request?.id === requestId ? null : request))
              }
              onProjectSaveRequestHandled={(requestId) =>
                setProjectSaveRequest((request) => (request?.id === requestId ? null : request))
              }
              onTemplateSaveRequestHandled={(requestId) => {
                setTemplateSaveRequest((request) => (request?.id === requestId ? null : request));
                void refreshUserTemplates();
              }}
              onTemplateExportRequestHandled={(requestId) =>
                setTemplateExportRequest((request) =>
                  request?.id === requestId ? null : request
                )
              }
              onTemplateInsertRequestHandled={(requestId) =>
                setTemplateInsertRequest((request) =>
                  request?.id === requestId ? null : request
                )
              }
              onImageExportRequestHandled={(requestId) =>
                setImageExportRequest((request) => (request?.id === requestId ? null : request))
              }
              onSaveStatusChange={setSaveStatus}
              onSelectionCommandRequestHandled={(requestId) =>
                setSelectionCommandRequest((request) =>
                  request?.id === requestId ? null : request
                )
              }
              onSelectLayerRequestHandled={(requestId) =>
                setSelectLayerRequest((request) => (request?.id === requestId ? null : request))
              }
              onSelectTool={setSelectedTool}
              onUploadRequestHandled={(requestId) =>
                setUploadRequest((request) => (request?.id === requestId ? null : request))
              }
              onZoomChange={setZoomPercentage}
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
              className="grid min-h-0 min-w-0 place-items-center bg-[#101113] p-7"
              aria-label="No open documents"
            >
              <div className="grid w-[min(680px,100%)] justify-items-center gap-[18px] text-center">
                <p className="m-0 text-xs font-extrabold uppercase tracking-normal text-[#8b929b]">
                  No open documents
                </p>
                <h2 className="m-0 text-[34px] font-bold leading-[1.12] text-[#f2f4f7]">
                  Start a Webster project
                </h2>
                <div className="flex flex-wrap justify-center gap-2.5">
                  <button
                    className="min-w-40 rounded-lg border border-[#4aa391] bg-[#203731] px-[18px] py-3.5 font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
                    onClick={openProjectPickerFromEmptyState}
                    type="button"
                  >
                    Open...
                  </button>
                  <button
                    className="min-w-40 rounded-lg border border-[#4aa391] bg-[#203731] px-[18px] py-3.5 font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
                    onClick={() => emptyImageInputRef.current?.click()}
                    type="button"
                  >
                    Open image...
                  </button>
                  <button
                    className="min-w-40 rounded-lg border border-[#333941] bg-[#202329] px-[18px] py-3.5 font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
                    onClick={() => setIsNewDocumentDialogOpen(true)}
                    type="button"
                  >
                    New...
                  </button>
                </div>
                {recentProjectError ? (
                  <p className="m-0 text-[13px] font-bold text-[#ffb9b9]">{recentProjectError}</p>
                ) : null}
                <div className="grid w-[min(540px,100%)] gap-2" aria-label="Create new presets">
                  {documentPresets.map((preset) => (
                    <button
                      className="flex min-h-[52px] items-center justify-between gap-4 rounded-lg border border-[#333941] bg-[#202329] px-3 py-2.5 text-left font-extrabold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
                      key={preset.label}
                      onClick={() => createDocumentTab(preset)}
                      type="button"
                    >
                      <span className="truncate">{preset.label}</span>
                      <strong className="whitespace-nowrap text-xs text-[#9aa1ab]">
                        {preset.width} x {preset.height}
                      </strong>
                    </button>
                  ))}
                </div>
                <div
                  className="mt-0.5 grid w-[min(540px,100%)] gap-2 text-left"
                  aria-label="Previous projects"
                >
                  <h3 className="m-0 text-[13px] font-bold text-[#d9dde3]">Previous projects</h3>
                  {recentProjects.length > 0 ? (
                    <div className="grid gap-2">
                      {recentProjects.map((project) => (
                        <button
                          className="flex min-h-[52px] w-full items-center justify-between gap-4 rounded-lg border border-[#30353d] bg-[#17191d] px-3 py-2.5 text-left font-bold text-[#eef1f4]"
                          key={project.id}
                          onClick={() => openProjectHandle(project.handle)}
                          type="button"
                        >
                          <span className="truncate">{project.filename}</span>
                          <strong className="whitespace-nowrap text-xs text-[#9aa1ab]">
                            {formatRecentProjectDate(project.savedAt)}
                          </strong>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="m-0 text-[13px] text-[#8b929b]">No previous projects yet.</p>
                  )}
                </div>
                <input
                  ref={emptyImageInputRef}
                  accept="image/*"
                  className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]"
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (file) {
                      void openImageAsNewDocument(file);
                      event.target.value = "";
                    }
                  }}
                  type="file"
                />
                <input
                  ref={emptyProjectInputRef}
                  accept=".webster,application/zip,application/vnd.webster.project"
                  className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]"
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (file) {
                      openProjectInNewTab(file, null);
                      event.target.value = "";
                    }
                  }}
                  type="file"
                />
              </div>
            </section>
          )}
        </div>
        <ResizeHandle
          aria-label="Resize side panels"
          className="max-[760px]:hidden"
          hidden={!activeDocument}
          onPointerDown={startRightPanelResize}
          orientation="vertical"
        />
        <aside
          className={cn(
            "flex min-h-0 flex-col overflow-x-hidden overflow-y-auto bg-[#17191d] opacity-100 overscroll-contain transition-[opacity,transform] duration-[220ms] ease-in-out max-[760px]:col-[1/-1] max-[760px]:row-start-2 max-[760px]:grid max-[760px]:grid-cols-3 max-[760px]:grid-rows-[220px] max-[760px]:overflow-x-auto max-[760px]:overflow-y-hidden max-[760px]:border-t max-[760px]:border-[#2a2d31]",
            activeDocument
              ? ""
              : "pointer-events-none translate-x-3 opacity-0 max-[760px]:col-start-5 max-[760px]:row-start-1"
          )}
          aria-label="Editor panels"
          ref={sidePanelsRef}
        >
          <div
            className={cn(
              "flex-none overflow-hidden max-[760px]:min-h-0",
              collapsedSidePanels.layers ? "h-[42px]" : "h-[var(--layers-panel-height)]"
            )}
          >
            <LayersPanel
              canGroupSelectedLayers={canGroupSelectedLayers}
              isCollapsed={collapsedSidePanels.layers}
              layers={layers}
              onGroupSelectedLayers={groupSelectedLayers}
              onLayerCommand={runLayerCommand}
              onSelectLayers={(layerIds) => setSelectLayerRequest({ id: Date.now(), layerIds })}
              onToggleCollapsed={() => toggleSidePanelCollapsed("layers")}
            />
          </div>
          <ResizeHandle
            aria-label="Resize layers panel"
            className="flex-none max-[760px]:hidden"
            hidden={collapsedSidePanels.layers}
            onPointerDown={startLayersResize}
            orientation="horizontal"
          />
          <div
            className={cn(
              "flex-none overflow-hidden max-[760px]:min-h-0",
              collapsedSidePanels.properties
                ? "h-[42px]"
                : "h-[var(--properties-panel-height)]"
            )}
          >
            <PropertiesPanel
              isCollapsed={collapsedSidePanels.properties}
              onGroupSelectedLayers={groupSelectedLayers}
              onLayerCommand={runLayerCommand}
              onToggleCollapsed={() => toggleSidePanelCollapsed("properties")}
              selectedLayer={selectedLayer}
              selectedLayers={selectedLayers}
              selectedTool={selectedTool}
            />
          </div>
          <ResizeHandle
            aria-label="Resize properties panel"
            className="flex-none max-[760px]:hidden"
            hidden={collapsedSidePanels.properties}
            onPointerDown={startPropertiesResize}
            orientation="horizontal"
          />
          <div
            className={cn(
              "flex-none overflow-hidden",
              collapsedSidePanels.history ? "h-[42px]" : ""
            )}
          >
            <HistoryPanel
              entries={activeHistoryState.entries}
              isCollapsed={collapsedSidePanels.history}
              onToggleCollapsed={() => toggleSidePanelCollapsed("history")}
            />
          </div>
        </aside>
      </section>
      {isNewDocumentDialogOpen ? (
        <NewDocumentDialog
          onClose={() => setIsNewDocumentDialogOpen(false)}
          onCreate={createDocumentTab}
          onCreateFromUserTemplate={(template) => void createDocumentFromUserTemplate(template)}
          onDeleteUserTemplate={(template) => void deleteUserTemplate(template)}
          onExportUserTemplate={(template) => void exportUserTemplate(template)}
          onImportUserTemplate={(file) => void importUserTemplateFile(file)}
          onInsertUserTemplate={(template) => void insertUserTemplate(template)}
          onRenameUserTemplate={(template, name) => void renameUserTemplate(template, name)}
          canInsertUserTemplate={Boolean(activeDocument)}
          userTemplates={userTemplates}
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
                      width
                    }
                  : tab
              )
            );
            setDocumentCommandRequest({
              command: {
                anchor,
                height,
                type: "resize",
                width
              },
              id: Date.now()
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
                type: "resample",
                width
              },
              id: Date.now()
            });
            setIsResizeImageDialogOpen(false);
          }}
          onRestoreOriginal={() => {
            setImageLayerCommandRequest({
              command: {
                layerId: selectedImageLayer.id,
                type: "restore-original"
              },
              id: Date.now()
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
              title: activeDocument?.title ?? "untitled"
            });
            setIsExportImageDialogOpen(false);
          }}
        />
      ) : null}
      {imageLayerCommandPendingState ? (
        <ImageLayerCommandOverlay state={imageLayerCommandPendingState} />
      ) : null}
    </main>
  );
}

function ImageLayerCommandOverlay({ state }: { state: ImageLayerCommandPendingState }) {
  return (
    <div
      aria-live="polite"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6"
      role="dialog"
    >
      <div className="grid w-[min(360px,100%)] justify-items-center gap-3 rounded-xl border border-[#3a414a] bg-[rgba(23,25,29,0.98)] px-5 py-5 text-center shadow-[0_24px_48px_rgba(0,0,0,0.48)]">
        <span
          className="h-9 w-9 animate-spin rounded-full border-2 border-[#4aa391] border-t-transparent"
          aria-hidden="true"
        />
        <div>
          <p className="m-0 text-[15px] font-extrabold text-[#f2f4f7]">{state.title}</p>
          <p className="m-0 mt-1 text-xs font-bold text-[#8b929b]">{state.message}</p>
        </div>
      </div>
    </div>
  );
}

function isImageLayerSummary(
  layer: LayerSummary | null
): layer is LayerSummary & {
  canRestoreOriginalPixels: boolean;
  imagePixelHeight: number;
  imagePixelWidth: number;
  originalImagePixelHeight: number;
  originalImagePixelWidth: number;
} {
  return Boolean(layer && layer.type === "image" && "imagePixelWidth" in layer);
}

function hasSelectedAncestorLayer(
  layer: LayerSummary,
  layers: LayerSummary[],
  selectedLayerIds: Set<string>
) {
  const visitedGroupIds = new Set<string>();
  let groupId = layer.groupId;

  while (groupId && !visitedGroupIds.has(groupId)) {
    if (selectedLayerIds.has(groupId)) {
      return true;
    }

    visitedGroupIds.add(groupId);
    groupId = layers.find((candidate) => candidate.id === groupId)?.groupId ?? null;
  }

  return false;
}

function formatRecentProjectDate(savedAt: string) {
  const date = new Date(savedAt);

  if (Number.isNaN(date.getTime())) {
    return "recent";
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short"
  });
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

      reject(new Error("Image has no dimensions."));
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Unable to load image dimensions."));
    };
    image.src = objectUrl;
  });
}

function getProjectFilename(title: string) {
  const safeTitle = (title.trim() || "untitled").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");

  return safeTitle.toLowerCase().endsWith(".webster") ? safeTitle : `${safeTitle}.webster`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getDefaultStrokeWidth(style: StrokeStyle) {
  switch (style) {
    case "brush":
      return 14;
    case "highlighter":
      return 30;
    case "marker":
      return 22;
    case "pen":
      return 6;
    case "pencil":
      return 3;
  }
}

function getDefaultStrokeColor(style: StrokeStyle): [number, number, number, number] {
  switch (style) {
    case "brush":
      return [0.05, 0.06, 0.07, 0.88];
    case "highlighter":
      return [1, 0.78, 0.22, 0.36];
    case "marker":
      return [0.1, 0.42, 0.88, 0.95];
    case "pen":
      return [0.07, 0.08, 0.09, 1];
    case "pencil":
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
  "aria-label": string;
  className?: string;
  hidden?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  orientation: "horizontal" | "vertical";
}) {
  return (
    <button
      className={cn(
        "group relative z-[3] border-0 bg-[#2a2d31] p-0 opacity-100 transition-[background,opacity] duration-150 hover:bg-[#39404a] focus-visible:bg-[#39404a] [.is-resizing-editor_&]:bg-[#39404a]",
        hidden && "pointer-events-none opacity-0",
        orientation === "vertical" ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
        className
      )}
      onPointerDown={onPointerDown}
      type="button"
      {...buttonProps}
    >
      <span
        className={cn(
          "absolute rounded-full bg-[#777f8a] opacity-0 transition-opacity duration-150 group-hover:opacity-100",
          orientation === "vertical"
            ? "left-0.5 top-1/2 h-9 w-0.5 -translate-y-1/2"
            : "left-1/2 top-0.5 h-0.5 w-[42px] -translate-x-1/2"
        )}
        aria-hidden="true"
      />
    </button>
  );
}
