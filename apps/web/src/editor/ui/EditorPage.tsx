"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { LayerCommand, LayerSummary } from "@/editor/core/EditorApp";
import type { MaskBrushOptions } from "../tools/MaskBrushTool";
import {
  canPickProjectFileHandle,
  pickProjectFileWithHandle
} from "./canvas/projectFiles";
import type { WebsterFileHandle } from "./canvas/projectFiles";
import {
  listRememberedProjectFiles,
  readRememberedProjectFileHandle
} from "./canvas/projectFileHandleStore";
import type { RecentProjectHandle } from "./canvas/projectFileHandleStore";
import type { SaveStatus } from "./canvas/useProjectFileActions";
import { CanvasView } from "./CanvasView";
import type { EditorDocumentTab, NewDocumentSize } from "./editorDocuments";
import "./EditorPage.css";
import { HistoryPanel } from "./HistoryPanel";
import { LayersPanel } from "./LayersPanel";
import { NewDocumentDialog } from "./NewDocumentDialog";
import { PropertiesPanel } from "./PropertiesPanel";
import { TabsBar } from "./TabsBar";
import { Toolbar } from "./Toolbar";
import { ToolsPanel } from "./ToolsPanel";

const initialTabs: EditorDocumentTab[] = [];

const mockTools = ["Move", "Pan", "Mask Brush", "Marquee", "Brush", "Eraser", "Text", "Zoom"];

const initialLayers: LayerSummary[] = [];

const mockHistory = ["New document", "Selected Move tool"];
const documentPresets: Array<NewDocumentSize & { label: string }> = [
  { height: 800, label: "Canvas 1200 x 800", width: 1200 },
  { height: 1080, label: "HD 1920 x 1080", width: 1920 },
  { height: 1080, label: "Square 1080 x 1080", width: 1080 }
];
const layersPanelMinHeight = 120;
const propertiesPanelMinHeight = 150;
const historyPanelMinHeight = 120;
const sidePanelHandleHeight = 12;

type EditorLayoutVars = CSSProperties & {
  "--tools-panel-width": string;
  "--right-panel-width": string;
  "--layers-panel-height": string;
  "--properties-panel-height": string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function EditorPage() {
  const emptyProjectInputRef = useRef<HTMLInputElement | null>(null);
  const sidePanelsRef = useRef<HTMLElement | null>(null);
  const documentCounterRef = useRef(1);
  const [selectedTool, setSelectedTool] = useState("Move");
  const [maskBrushOptions, setMaskBrushOptions] = useState<MaskBrushOptions>({
    mode: "reveal",
    opacity: 1,
    size: 48
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [zoomPercentage, setZoomPercentage] = useState(100);
  const [tabs, setTabs] = useState<EditorDocumentTab[]>(initialTabs);
  const [isNewDocumentDialogOpen, setIsNewDocumentDialogOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProjectHandle[]>([]);
  const [recentProjectError, setRecentProjectError] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerSummary[]>(initialLayers);
  const [uploadRequest, setUploadRequest] = useState<{ file: File; id: number } | null>(null);
  const [selectLayerRequest, setSelectLayerRequest] = useState<{
    id: number;
    layerId: string;
  } | null>(null);
  const [layerCommandRequest, setLayerCommandRequest] = useState<{
    command: LayerCommand;
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
  const [closedDocumentRequest, setClosedDocumentRequest] = useState<{
    id: number;
    tabId: string;
  } | null>(null);
  const [toolsPanelWidth, setToolsPanelWidth] = useState(88);
  const [rightPanelWidth, setRightPanelWidth] = useState(380);
  const [layersPanelHeight, setLayersPanelHeight] = useState(190);
  const [propertiesPanelHeight, setPropertiesPanelHeight] = useState(250);

  const layoutStyle: EditorLayoutVars = {
    "--tools-panel-width": `${toolsPanelWidth}px`,
    "--right-panel-width": `${rightPanelWidth}px`,
    "--layers-panel-height": `${layersPanelHeight}px`,
    "--properties-panel-height": `${propertiesPanelHeight}px`
  };
  const selectedLayer = layers.find((layer) => layer.isSelected) ?? null;
  const activeDocument = tabs.find((tab) => tab.isActive) ?? tabs[0] ?? null;

  useEffect(() => {
    let didCancel = false;

    async function loadRecentProjects() {
      const projects = await listRememberedProjectFiles().catch(() => []);

      if (!didCancel) {
        setRecentProjects(projects);
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
    setIsNewDocumentDialogOpen(false);
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
        propertiesPanelHeight -
        historyPanelMinHeight -
        sidePanelHandleHeight
    );
  }

  function getMaxPropertiesPanelHeight() {
    return Math.max(
      propertiesPanelMinHeight,
      getSidePanelHeight() - layersPanelHeight - historyPanelMinHeight - sidePanelHandleHeight
    );
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
      setToolsPanelWidth(clamp(startWidth + moveEvent.clientX - startX, 68, 180));
    }

    startResize(resize);
  }

  function startRightPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const startX = event.clientX;
    const startWidth = rightPanelWidth;

    function resize(moveEvent: PointerEvent) {
      setRightPanelWidth(clamp(startWidth - (moveEvent.clientX - startX), 320, 620));
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
    <main className="editor-page">
      <Toolbar
        canEditDocument={Boolean(activeDocument)}
        documentTitle={activeDocument?.title ?? "No document"}
        onNewDocument={() => setIsNewDocumentDialogOpen(true)}
        onOpenProject={openProjectInNewTab}
        onSaveAsProject={() => setProjectSaveRequest({ id: Date.now(), mode: "save-as" })}
        onSaveProject={() => setProjectSaveRequest({ id: Date.now(), mode: "save" })}
        onUploadImage={(file) => setUploadRequest({ file, id: Date.now() })}
        maskBrushOptions={maskBrushOptions}
        onMaskBrushOptionsChange={(options) =>
          setMaskBrushOptions((currentOptions) => ({
            ...currentOptions,
            ...options
          }))
        }
        saveStatus={saveStatus}
        selectedTool={selectedTool}
        zoomPercentage={zoomPercentage}
      />
      <section className="editor-shell" style={layoutStyle} aria-label="Editor workspace">
        <ToolsPanel
          onSelectTool={setSelectedTool}
          selectedTool={selectedTool}
          tools={mockTools}
        />
        <button
          aria-label="Resize tools panel"
          className="resize-handle resize-handle-vertical"
          onPointerDown={startToolsResize}
          type="button"
        />
        <div className="editor-center">
          <TabsBar
            onCloseTab={closeDocumentTab}
            onRenameTab={renameDocumentTab}
            onSelectTab={activateTab}
            tabs={tabs}
          />
          {activeDocument ? (
            <CanvasView
              activeDocument={activeDocument}
              closedDocumentRequest={closedDocumentRequest}
              layerCommandRequest={layerCommandRequest}
              maskBrushOptions={maskBrushOptions}
              onLayersChange={setLayers}
              onLayerCommandRequestHandled={(requestId) =>
                setLayerCommandRequest((request) => (request?.id === requestId ? null : request))
              }
              onProjectFileRequestHandled={(requestId) =>
                setProjectFileRequest((request) => (request?.id === requestId ? null : request))
              }
              onProjectSaveRequestHandled={(requestId) =>
                setProjectSaveRequest((request) => (request?.id === requestId ? null : request))
              }
              onSaveStatusChange={setSaveStatus}
              onSelectLayerRequestHandled={(requestId) =>
                setSelectLayerRequest((request) => (request?.id === requestId ? null : request))
              }
              onUploadRequestHandled={(requestId) =>
                setUploadRequest((request) => (request?.id === requestId ? null : request))
              }
              onZoomChange={setZoomPercentage}
              projectFileRequest={projectFileRequest}
              projectSaveRequest={projectSaveRequest}
              selectLayerRequest={selectLayerRequest}
              selectedTool={selectedTool}
              uploadRequest={uploadRequest}
            />
          ) : (
            <section className="empty-workspace" aria-label="No open documents">
              <div className="empty-workspace-content">
                <p className="empty-workspace-kicker">No open documents</p>
                <h2>Start a Webster project</h2>
                <div className="empty-workspace-actions">
                  <button onClick={openProjectPickerFromEmptyState} type="button">
                    Open...
                  </button>
                  <button onClick={() => setIsNewDocumentDialogOpen(true)} type="button">
                    New...
                  </button>
                </div>
                {recentProjectError ? (
                  <p className="empty-workspace-error">{recentProjectError}</p>
                ) : null}
                <div className="empty-workspace-presets" aria-label="Create new presets">
                  {documentPresets.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => createDocumentTab(preset)}
                      type="button"
                    >
                      <span>{preset.label}</span>
                      <strong>
                        {preset.width} x {preset.height}
                      </strong>
                    </button>
                  ))}
                </div>
                <div className="empty-workspace-recent" aria-label="Previous projects">
                  <h3>Previous projects</h3>
                  {recentProjects.length > 0 ? (
                    <div className="empty-workspace-recent-list">
                      {recentProjects.map((project) => (
                        <button
                          key={project.id}
                          onClick={() => openProjectHandle(project.handle)}
                          type="button"
                        >
                          <span>{project.filename}</span>
                          <strong>{formatRecentProjectDate(project.savedAt)}</strong>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p>No previous projects yet.</p>
                  )}
                </div>
                <input
                  ref={emptyProjectInputRef}
                  accept=".webster,application/zip,application/vnd.webster.project"
                  className="visually-hidden"
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
        <button
          aria-label="Resize side panels"
          className="resize-handle resize-handle-vertical"
          onPointerDown={startRightPanelResize}
          type="button"
        />
        <aside className="editor-side-panels" aria-label="Editor panels" ref={sidePanelsRef}>
          <LayersPanel
            layers={layers}
            onLayerCommand={runLayerCommand}
            onSelectLayer={(layerId) => setSelectLayerRequest({ id: Date.now(), layerId })}
          />
          <button
            aria-label="Resize layers panel"
            className="resize-handle resize-handle-horizontal"
            onPointerDown={startLayersResize}
            type="button"
          />
          <PropertiesPanel
            onLayerCommand={runLayerCommand}
            selectedLayer={selectedLayer}
            selectedTool={selectedTool}
          />
          <button
            aria-label="Resize properties panel"
            className="resize-handle resize-handle-horizontal"
            onPointerDown={startPropertiesResize}
            type="button"
          />
          <HistoryPanel entries={mockHistory} />
        </aside>
      </section>
      {isNewDocumentDialogOpen ? (
        <NewDocumentDialog
          onClose={() => setIsNewDocumentDialogOpen(false)}
          onCreate={createDocumentTab}
        />
      ) : null}
    </main>
  );
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

function getProjectFilename(title: string) {
  const safeTitle = (title.trim() || "untitled").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");

  return safeTitle.toLowerCase().endsWith(".webster") ? safeTitle : `${safeTitle}.webster`;
}
