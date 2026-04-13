"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";
import type { LayerCommand, LayerSummary } from "@/editor/core/EditorApp";
import { CanvasView } from "./CanvasView";
import "./EditorPage.css";
import { HistoryPanel } from "./HistoryPanel";
import { LayersPanel } from "./LayersPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { TabsBar } from "./TabsBar";
import { Toolbar } from "./Toolbar";
import { ToolsPanel } from "./ToolsPanel";

const mockTabs = [
  {
    id: "untitled",
    title: "Untitled",
    isActive: true
  }
];

const mockTools = ["Move", "Pan", "Marquee", "Brush", "Eraser", "Text", "Zoom"];

const initialLayers: LayerSummary[] = [
  {
    id: "default-shape",
    isVisible: true,
    isSelected: true,
    locked: false,
    name: "Rectangle",
    opacity: 1,
    rotation: 0,
    type: "shape",
    x: -110,
    y: -60,
    width: 260,
    height: 160
  }
];

const mockHistory = ["New document", "Selected Move tool"];
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
  const sidePanelsRef = useRef<HTMLElement | null>(null);
  const [selectedTool, setSelectedTool] = useState("Move");
  const [zoomPercentage, setZoomPercentage] = useState(100);
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
  } | null>(null);
  const [projectSaveRequest, setProjectSaveRequest] = useState<{
    id: number;
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

  function runLayerCommand(command: LayerCommand) {
    setLayerCommandRequest({ command, id: Date.now() });
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
        documentTitle="Untitled"
        onOpenProject={(file) => setProjectFileRequest({ file, id: Date.now() })}
        onSaveProject={() => setProjectSaveRequest({ id: Date.now() })}
        onUploadImage={(file) => setUploadRequest({ file, id: Date.now() })}
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
          <TabsBar tabs={mockTabs} />
          <CanvasView
            activeTabTitle="Untitled"
            layerCommandRequest={layerCommandRequest}
            onLayersChange={setLayers}
            onZoomChange={setZoomPercentage}
            projectFileRequest={projectFileRequest}
            projectSaveRequest={projectSaveRequest}
            selectLayerRequest={selectLayerRequest}
            selectedTool={selectedTool}
            uploadRequest={uploadRequest}
          />
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
    </main>
  );
}
