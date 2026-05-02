import type { MouseEvent as ReactMouseEvent, SyntheticEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  canPickProjectFileHandle,
  pickProjectFileWithHandle
} from "../../projects/projectFiles";
import type { WebsterFileHandle } from "../../projects/projectFiles";
import type { SaveStatus } from "../hooks/useProjectFileActions";
import type { MaskBrushOptions } from "../../tools/mask-brush/MaskBrushTypes";
import type { LayerSummary } from "../../app/EditorApp";
import type { StrokeStyle } from "../../layers/StrokeLayer";
import type { SelectionCommand } from "../../app/EditorApp";
import type { SelectionMode } from "../../selection/SelectionManager";
import { cn } from "../classNames";

type ToolbarProps = {
  canEditDocument: boolean;
  canGroupSelectedLayers: boolean;
  canRedo: boolean;
  canUndo: boolean;
  canvasSize: { height: number; width: number } | null;
  documentTitle: string;
  onCopy: () => void;
  onCut: () => void;
  onDeleteSelectedLayer: () => void;
  onDuplicateSelectedLayer: () => void;
  onGroupSelectedLayers: () => void;
  onNewDocument: () => void;
  onOpenCanvasResize: () => void;
  onOpenImageDocument: (file: File) => void;
  onOpenExportDialog: () => void;
  onOpenImageResize: () => void;
  onOpenProject: (file: File, handle?: WebsterFileHandle | null) => void;
  onPaste: () => void;
  onRedo: () => void;
  onRestoreImageOriginal: () => void;
  onExportTemplate: () => void;
  onSaveAsProject: () => void;
  onSaveProject: () => void;
  onSaveTemplate: () => void;
  onAddAdjustmentLayer: () => void;
  onSelectionCommand: (command: SelectionCommand) => void;
  onSelectTool: (tool: string) => void;
  onShowCanvasBorderChange: (show: boolean) => void;
  onUndo: () => void;
  onUploadImage: (file: File) => void;
  maskBrushOptions: MaskBrushOptions;
  magicSelectionTolerance: number;
  onMagicSelectionToleranceChange: (tolerance: number) => void;
  onMaskBrushOptionsChange: (options: Partial<MaskBrushOptions>) => void;
  onSelectionModeChange: (mode: SelectionMode) => void;
  onStrokeColorChange: (color: [number, number, number, number]) => void;
  onStrokeModeChange: (mode: "draw" | "erase") => void;
  onStrokeStyleChange: (style: StrokeStyle) => void;
  onStrokeTargetChange: (target: StrokeTargetSelection) => void;
  onStrokeWidthChange: (width: number) => void;
  saveStatus: SaveStatus;
  selectedLayer: LayerSummary | null;
  selectedSelectionMode: SelectionMode;
  selectedStrokeColor: [number, number, number, number];
  selectedStrokeMode: "draw" | "erase";
  selectedStrokeStyle: StrokeStyle;
  selectedStrokeTargetLayerId: string | null;
  selectedStrokeTargetMode: "layer" | "new" | "selected";
  selectedStrokeWidth: number;
  selectedTool: string;
  showCanvasBorder: boolean;
  strokeLayers: LayerSummary[];
  redoLabel: string | null;
  undoLabel: string | null;
  zoomPercentage: number;
};

export type StrokeTargetSelection = {
  layerId: string | null;
  mode: "layer" | "new" | "selected";
};

const shortcutMenuGroups = [
  {
    label: "Tools",
    shortcuts: [
      ["V", "Move"],
      ["H", "Pan"],
      ["B", "Mask brush"],
      ["T", "Text"],
      ["D", "Draw"],
      ["S", "Shape"],
      ["R", "Rectangle"],
      ["E", "Ellipse"],
      ["L", "Lasso"],
      ["W", "Magic"]
    ]
  },
  {
    label: "Layer",
    shortcuts: [
      ["Arrows", "Nudge"],
      ["Shift+Arrows", "10 px"],
      ["Del", "Delete"],
      ["Ctrl/Cmd+C", "Copy"],
      ["Ctrl/Cmd+X", "Cut"],
      ["Ctrl/Cmd+V", "Paste"],
      ["Ctrl/Cmd+J", "Duplicate"],
      ["Ctrl/Cmd+G", "Group"]
    ]
  },
  {
    label: "Selection",
    shortcuts: [
      ["Shift", "Add mode"],
      ["Alt", "Subtract mode"],
      ["Shift+Alt", "Intersect mode"],
      ["Ctrl/Cmd+D", "Clear"]
    ]
  },
  {
    label: "History",
    shortcuts: [
      ["Ctrl/Cmd+Z", "Undo"],
      ["Shift+Ctrl/Cmd+Z", "Redo"],
      ["Ctrl/Cmd+S", "Save"]
    ]
  }
];

export function Toolbar({
  canEditDocument,
  canGroupSelectedLayers,
  canRedo,
  canUndo,
  canvasSize,
  documentTitle,
  onCopy,
  onCut,
  onDeleteSelectedLayer,
  onDuplicateSelectedLayer,
  onGroupSelectedLayers,
  onNewDocument,
  onOpenCanvasResize,
  onOpenImageDocument,
  onOpenExportDialog,
  onOpenImageResize,
  onOpenProject,
  onPaste,
  onRedo,
  onRestoreImageOriginal,
  onExportTemplate,
  onSaveAsProject,
  onSaveProject,
  onSaveTemplate,
  onAddAdjustmentLayer,
  onSelectionCommand,
  onSelectTool,
  onShowCanvasBorderChange,
  onUndo,
  onUploadImage,
  maskBrushOptions,
  magicSelectionTolerance,
  onMagicSelectionToleranceChange,
  onMaskBrushOptionsChange,
  onSelectionModeChange,
  onStrokeColorChange,
  onStrokeModeChange,
  onStrokeStyleChange,
  onStrokeTargetChange,
  onStrokeWidthChange,
  saveStatus,
  selectedLayer,
  selectedSelectionMode,
  selectedStrokeColor,
  selectedStrokeMode,
  selectedStrokeStyle,
  selectedStrokeTargetLayerId,
  selectedStrokeTargetMode,
  selectedStrokeWidth,
  selectedTool,
  showCanvasBorder,
  strokeLayers,
  redoLabel,
  undoLabel,
  zoomPercentage
}: ToolbarProps) {
  const [isShortcutDialogOpen, setIsShortcutDialogOpen] = useState(false);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const documentImageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileMenuRef = useRef<HTMLDetailsElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function closeOpenMenus(event: PointerEvent) {
      if (!toolbarRef.current || toolbarRef.current.contains(event.target as Node)) {
        return;
      }

      closeAllMenus(toolbarRef.current);
    }

    function closeMenusOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (toolbarRef.current) {
        closeAllMenus(toolbarRef.current);
      }

      setIsShortcutDialogOpen(false);
    }

    document.addEventListener("pointerdown", closeOpenMenus);
    document.addEventListener("keydown", closeMenusOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOpenMenus);
      document.removeEventListener("keydown", closeMenusOnEscape);
    };
  }, []);

  function openImageDocumentPicker() {
    fileMenuRef.current?.removeAttribute("open");
    documentImageInputRef.current?.click();
  }

  function openImagePicker() {
    fileMenuRef.current?.removeAttribute("open");
    fileInputRef.current?.click();
  }

  async function openProjectPicker() {
    fileMenuRef.current?.removeAttribute("open");

    if (canPickProjectFileHandle()) {
      try {
        const pickedProject = await pickProjectFileWithHandle();

        if (pickedProject) {
          onOpenProject(pickedProject.file, pickedProject.handle);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        throw error;
      }

      return;
    }

    projectInputRef.current?.click();
  }

  function closeMenu(event: ReactMouseEvent<HTMLElement>) {
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  function closeSiblingMenus(event: SyntheticEvent<HTMLDetailsElement>) {
    const openedMenu = event.currentTarget;

    if (!openedMenu.open || !toolbarRef.current) {
      return;
    }

    for (const menu of toolbarRef.current.querySelectorAll("details.toolbar-menu")) {
      if (menu !== openedMenu) {
        menu.removeAttribute("open");
      }
    }
  }

  return (
    <header
      className="grid grid-cols-[minmax(180px,auto)_minmax(0,1fr)_auto] items-center gap-[18px] border-b border-[#2a2d31] bg-[#17191d] px-4 py-2.5 max-[980px]:grid-cols-[minmax(160px,auto)_minmax(0,1fr)] max-[760px]:min-h-[118px] max-[760px]:grid-cols-1"
      aria-label="Top toolbar"
      ref={toolbarRef}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-[#4aa391] bg-[#276f63] font-extrabold text-white"
          aria-hidden="true"
        >
          W
        </span>
        <div>
          <p className="m-0 mb-0.5 text-[11px] font-bold uppercase tracking-normal text-[#8b929b]">
            Webster
          </p>
          <h1 className="m-0 truncate text-[17px] font-bold tracking-normal text-[#f2f4f7]">
            {documentTitle}
          </h1>
        </div>
      </div>
      <nav
        className="flex items-center justify-start gap-2 max-[980px]:overflow-x-auto max-[760px]:overflow-x-auto"
        aria-label="Editor menus"
      >
        <details className="toolbar-menu relative" onToggle={closeSiblingMenus} ref={fileMenuRef}>
          <summary className={toolbarButtonClass}>File</summary>
          <div className={toolbarMenuClass} role="menu">
            <button
              className={toolbarMenuItemClass}
              onClick={() => {
                fileMenuRef.current?.removeAttribute("open");
                onNewDocument();
              }}
              type="button"
            >
              New
            </button>
            <button className={toolbarMenuItemClass} onClick={openProjectPicker} type="button">
              Open .webster...
            </button>
            <button className={toolbarMenuItemClass} onClick={openImageDocumentPicker} type="button">
              Open image as document...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={openImagePicker}
              type="button"
            >
              Import image as layer...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute("open");
                onSaveProject();
              }}
              type="button"
            >
              Save
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute("open");
                onSaveAsProject();
              }}
              type="button"
            >
              Save as .webster...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute("open");
                onSaveTemplate();
              }}
              type="button"
            >
              Save as template...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute("open");
                onExportTemplate();
              }}
              type="button"
            >
              Export template...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => {
                fileMenuRef.current?.removeAttribute("open");
                onOpenExportDialog();
              }}
              type="button"
            >
              Export as...
            </button>
          </div>
        </details>
        <details className="toolbar-menu relative" onToggle={closeSiblingMenus}>
          <summary className={toolbarButtonClass}>Edit</summary>
          <div className={toolbarMenuClass} role="menu">
            <button
              className={toolbarMenuItemClass}
              disabled={!canUndo}
              onClick={(event) => {
                closeMenu(event);
                onUndo();
              }}
              type="button"
            >
              <span>{undoLabel ? `Undo ${undoLabel}` : "Undo"}</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+Z</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canRedo}
              onClick={(event) => {
                closeMenu(event);
                onRedo();
              }}
              type="button"
            >
              <span>{redoLabel ? `Redo ${redoLabel}` : "Redo"}</span>
              <span className={toolbarMenuHintClass}>Shift+Ctrl/Cmd+Z</span>
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!selectedLayer}
              onClick={(event) => {
                closeMenu(event);
                onDuplicateSelectedLayer();
              }}
              type="button"
            >
              <span>Duplicate layer</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+J</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!selectedLayer}
              onClick={(event) => {
                closeMenu(event);
                onDeleteSelectedLayer();
              }}
              type="button"
            >
              <span>Delete layer</span>
              <span className={toolbarMenuHintClass}>Del / Backspace</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canGroupSelectedLayers}
              onClick={(event) => {
                closeMenu(event);
                onGroupSelectedLayers();
              }}
              type="button"
            >
              <span>Group selected</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+G</span>
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onCut();
              }}
              type="button"
            >
              <span>Cut</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+X</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onCopy();
              }}
              type="button"
            >
              <span>Copy</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+C</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onPaste();
              }}
              type="button"
            >
              <span>Paste</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+V</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!isImageLayerSummary(selectedLayer) || selectedLayer.locked}
              onClick={(event) => {
                closeMenu(event);
                onOpenImageResize();
              }}
              type="button"
            >
              Resize image pixels...
              <span className={toolbarMenuHintClass}>Image</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={
                !isImageLayerSummary(selectedLayer) ||
                selectedLayer.locked ||
                !selectedLayer.canRestoreOriginalPixels
              }
              onClick={(event) => {
                closeMenu(event);
                onRestoreImageOriginal();
              }}
              type="button"
            >
              Revert image to original pixels
              <span className={toolbarMenuHintClass}>Image</span>
            </button>
          </div>
        </details>
        <details className="toolbar-menu relative" onToggle={closeSiblingMenus}>
          <summary className={toolbarButtonClass}>View</summary>
          <div className={toolbarMenuClass} role="menu">
            <button className={toolbarMenuItemClass} disabled type="button">
              Canvas: {canvasSize ? formatCanvasSize(canvasSize) : "No document"}
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onOpenCanvasResize();
              }}
              type="button"
            >
              Resize canvas...
            </button>
            <MenuSeparator />
            <button className={toolbarMenuItemClass} disabled type="button">
              Zoom: {zoomPercentage}%
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Zoom in <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Zoom out <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Fit canvas <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              onClick={(event) => {
                closeMenu(event);
                setIsShortcutDialogOpen(true);
              }}
              type="button"
            >
              <span>Keyboard shortcuts...</span>
              <span className={toolbarMenuHintClass}>Keys</span>
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectTool("Pan");
              }}
              type="button"
            >
              Pan workspace
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Toggle checkerboard <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => onShowCanvasBorderChange(!showCanvasBorder)}
              type="button"
            >
              Canvas glow border
              <span className={toolbarMenuHintClass}>{showCanvasBorder ? "On" : "Off"}</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Rulers and guides <span className={toolbarMenuHintClass}>TODO</span>
            </button>
          </div>
        </details>
        <details className="toolbar-menu relative" onToggle={closeSiblingMenus}>
          <summary className={toolbarButtonClass}>Filter</summary>
          <div className={toolbarMenuClass} role="menu">
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onAddAdjustmentLayer();
              }}
              type="button"
            >
              Add adjustment layer
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Layer filters live in Properties
            </button>
            <MenuSeparator />
            <button className={toolbarMenuItemClass} disabled type="button">
              Brightness / Contrast <span className={toolbarMenuHintClass}>Implemented</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Hue / Saturation <span className={toolbarMenuHintClass}>Implemented</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Blur / Drop shadow <span className={toolbarMenuHintClass}>Implemented</span>
            </button>
            <MenuSeparator />
            <button className={toolbarMenuItemClass} disabled type="button">
              Filter gallery <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Clip adjustment to layer <span className={toolbarMenuHintClass}>TODO</span>
            </button>
          </div>
        </details>
        <details className="toolbar-menu relative" onToggle={closeSiblingMenus}>
          <summary className={toolbarButtonClass}>Select</summary>
          <div className={toolbarMenuClass} role="menu">
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectionCommand("clear");
              }}
              type="button"
            >
              <span>Clear selection</span>
              <span className={toolbarMenuHintClass}>Ctrl/Cmd+D</span>
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectionCommand("invert");
              }}
              type="button"
            >
              Invert selection
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectionCommand("convert-to-mask");
              }}
              type="button"
            >
              Convert to mask
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                const radius = promptPositiveNumber("Feather radius", 8);

                if (radius !== null) {
                  onSelectionCommand({ radius, type: "feather" });
                }
              }}
              type="button"
            >
              Feather selection...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                const amount = promptPositiveNumber("Grow by pixels", 8);

                if (amount !== null) {
                  onSelectionCommand({ amount, type: "grow" });
                }
              }}
              type="button"
            >
              Grow selection...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                const amount = promptPositiveNumber("Shrink by pixels", 8);

                if (amount !== null) {
                  onSelectionCommand({ amount, type: "shrink" });
                }
              }}
              type="button"
            >
              Shrink selection...
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                const name = window.prompt("Selection name", "Selection");

                if (name) {
                  onSelectionCommand({ name, type: "save" });
                }
              }}
              type="button"
            >
              Save selection...
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                const name = window.prompt("Selection name to load", "Selection");

                if (name) {
                  onSelectionCommand({ name, mode: selectedSelectionMode, type: "load" });
                }
              }}
              type="button"
            >
              Load selection...
            </button>
          </div>
        </details>
        {selectedTool === "Mask Brush" ? (
          <div className="flex items-center gap-2 pl-1.5" aria-label="Mask brush options">
            <label className="flex items-center gap-[5px] text-xs font-bold text-[#c9cdd2]">
              Size
              <input
                className={maskBrushInputClass}
                min="1"
                max="256"
                onChange={(event) =>
                  onMaskBrushOptionsChange({ size: Number(event.target.value) })
                }
                type="number"
                value={maskBrushOptions.size}
              />
            </label>
            <label className="flex items-center gap-[5px] text-xs font-bold text-[#c9cdd2]">
              Opacity
              <input
                className={maskBrushInputClass}
                min="1"
                max="100"
                onChange={(event) =>
                  onMaskBrushOptionsChange({ opacity: Number(event.target.value) / 100 })
                }
                type="number"
                value={Math.round(maskBrushOptions.opacity * 100)}
              />
            </label>
            <label className="flex items-center gap-[5px] text-xs font-bold text-[#c9cdd2]">
              Mode
              <select
                className={cn(maskBrushInputClass, "w-[122px]")}
                onChange={(event) =>
                  onMaskBrushOptionsChange({
                    mode: event.target.value === "hide" ? "hide" : "reveal"
                  })
                }
                value={maskBrushOptions.mode}
              >
                <option value="reveal">Reveal white</option>
                <option value="hide">Hide black</option>
              </select>
            </label>
          </div>
        ) : null}
        {selectedTool === "Draw" ? (
          <div className="flex items-center gap-2 pl-1.5" aria-label="Draw options">
            <label className="flex items-center gap-[5px] text-xs font-bold text-[#c9cdd2]">
              Target
              <select
                className={cn(maskBrushInputClass, "w-[156px]")}
                onChange={(event) => onStrokeTargetChange(parseStrokeTarget(event.target.value))}
                value={formatStrokeTargetValue(selectedStrokeTargetMode, selectedStrokeTargetLayerId)}
              >
                <option value="new">New layer</option>
                <option value="selected">Selected stroke layer</option>
                {strokeLayers.map((layer) => (
                  <option key={layer.id} value={`layer:${layer.id}`}>
                    {layer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-[5px] text-xs font-bold text-[#c9cdd2]">
              Type
              <select
                className={cn(maskBrushInputClass, "w-[118px]")}
                onChange={(event) => onStrokeStyleChange(toStrokeStyle(event.target.value))}
                value={selectedStrokeStyle}
              >
                <option value="pencil">Pencil</option>
                <option value="pen">Pen</option>
                <option value="brush">Brush</option>
                <option value="marker">Marker</option>
                <option value="highlighter">Highlighter</option>
              </select>
            </label>
            <label className="flex items-center gap-[5px] text-xs font-bold text-[#c9cdd2]">
              Color
              <input
                aria-label="Draw color"
                className="h-[34px] w-[48px] rounded-md border border-[#33373d] bg-[#101113] p-1"
                onChange={(event) =>
                  onStrokeColorChange(hexToColor(event.target.value, selectedStrokeColor[3]))
                }
                type="color"
                value={colorToHex(selectedStrokeColor)}
              />
            </label>
            <label className="flex items-center gap-[5px] text-xs font-bold text-[#c9cdd2]">
              Size
              <input
                className={maskBrushInputClass}
                min="1"
                max="256"
                onChange={(event) => onStrokeWidthChange(Number(event.target.value))}
                type="number"
                value={selectedStrokeWidth}
              />
            </label>
            <button
              className={cn(toolbarButtonClass, selectedStrokeMode === "erase" && "border-[#4aa391] bg-[#203731]")}
              onClick={() => onStrokeModeChange(selectedStrokeMode === "erase" ? "draw" : "erase")}
              type="button"
            >
              {selectedStrokeMode === "erase" ? "Draw" : "Eraser"}
            </button>
          </div>
        ) : null}
        {isSelectionToolSelected(selectedTool) ? (
          <div className="flex items-center gap-2 pl-1.5" aria-label="Selection options">
            <label className="flex items-center gap-[5px] text-xs font-bold text-[#c9cdd2]">
              Mode
              <select
                className={cn(maskBrushInputClass, "w-[118px]")}
                onChange={(event) => onSelectionModeChange(toSelectionMode(event.target.value))}
                value={selectedSelectionMode}
              >
                <option value="replace">Replace</option>
                <option value="add">Add</option>
                <option value="subtract">Subtract</option>
                <option value="intersect">Intersect</option>
              </select>
            </label>
            {selectedTool === "Magic Select" ? (
              <label className="flex items-center gap-[5px] text-xs font-bold text-[#c9cdd2]">
                Similarity
                <input
                  className={maskBrushInputClass}
                  min="0"
                  max="100"
                  onChange={(event) =>
                    onMagicSelectionToleranceChange(Number(event.target.value))
                  }
                  type="number"
                  value={magicSelectionTolerance}
                />
              </label>
            ) : null}
          </div>
        ) : null}
        <input
          ref={documentImageInputRef}
          accept="image/*"
          className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onOpenImageDocument(file);
              event.target.value = "";
            }
          }}
          type="file"
        />
        <input
          ref={fileInputRef}
          accept="image/*"
          className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onUploadImage(file);
              event.target.value = "";
            }
          }}
          type="file"
        />
        <input
          ref={projectInputRef}
          accept=".webster,application/zip,application/vnd.webster.project"
          className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onOpenProject(file, null);
              event.target.value = "";
            }
          }}
          type="file"
        />
      </nav>
      {isShortcutDialogOpen ? (
        <div
          aria-label="Keyboard shortcuts"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-5 py-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsShortcutDialogOpen(false);
            }
          }}
          role="dialog"
        >
          <div className="grid w-[min(760px,100%)] max-h-[min(720px,calc(100vh-48px))] gap-5 overflow-auto rounded-lg border border-[#3a414a] bg-[#17191d] p-5 shadow-[0_28px_72px_rgba(0,0,0,0.58)]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="m-0 text-[20px] font-extrabold text-[#f2f4f7]">
                Keyboard shortcuts
              </h2>
              <button
                aria-label="Close keyboard shortcuts"
                className="grid h-9 w-9 place-items-center rounded-md border border-[#333941] bg-[#202329] text-lg font-bold text-[#dce1e6] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
                onClick={() => setIsShortcutDialogOpen(false)}
                type="button"
              >
                x
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {shortcutMenuGroups.map((group) => (
                <section className="grid content-start gap-2" key={group.label}>
                  <h3 className="m-0 text-[11px] font-extrabold uppercase tracking-normal text-[#8b929b]">
                    {group.label}
                  </h3>
                  <div className="grid gap-2">
                    {group.shortcuts.map(([keys, action]) => (
                      <div
                        className="grid min-h-10 grid-cols-[minmax(120px,auto)_1fr] items-center gap-3 rounded-md border border-[#30353d] bg-[#202329] px-3 py-2"
                        key={`${group.label}-${keys}`}
                      >
                        <kbd className="justify-self-start rounded border border-[#3b5f58] bg-[#10231f] px-2 py-1 text-[12px] font-extrabold text-[#79dac7]">
                          {keys}
                        </kbd>
                        <span className="text-[13px] font-bold text-[#dce1e6]">{action}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div
        className="flex items-center justify-end gap-2 text-[13px] text-[#c9cdd2] max-[980px]:hidden"
        aria-label="Current editor status"
      >
        {saveStatus !== "idle" ? <span className={statusPillClass}>{getSaveStatusLabel(saveStatus)}</span> : null}
        {isImageLayerSummary(selectedLayer) ? (
          <span className={statusPillClass}>
            Image {selectedLayer.imagePixelWidth} x {selectedLayer.imagePixelHeight} px
          </span>
        ) : null}
        {canvasSize ? <button className={statusButtonClass} onClick={onOpenCanvasResize} type="button">{formatCanvasSize(canvasSize)}</button> : null}
        <span className={statusPillClass}>{selectedTool}</span>
        <span className={statusPillClass}>{zoomPercentage}%</span>
      </div>
    </header>
  );
}

function formatStrokeTargetValue(
  mode: "layer" | "new" | "selected",
  layerId: string | null
) {
  if (mode === "layer" && layerId) {
    return `layer:${layerId}`;
  }

  return mode;
}

function parseStrokeTarget(value: string): StrokeTargetSelection {
  if (value === "selected") {
    return { layerId: null, mode: "selected" };
  }

  if (value.startsWith("layer:")) {
    return { layerId: value.slice("layer:".length), mode: "layer" };
  }

  return { layerId: null, mode: "new" };
}

function toStrokeStyle(value: string): StrokeStyle {
  if (
    value === "pen" ||
    value === "brush" ||
    value === "marker" ||
    value === "highlighter"
  ) {
    return value;
  }

  return "pencil";
}

function colorToHex(color: [number, number, number, number]) {
  return `#${color
    .slice(0, 3)
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToColor(hex: string, alpha = 1): [number, number, number, number] {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return [
    Number.isFinite(red) ? red / 255 : 0,
    Number.isFinite(green) ? green / 255 : 0,
    Number.isFinite(blue) ? blue / 255 : 0,
    alpha
  ];
}

function isSelectionToolSelected(tool: string) {
  return (
    tool === "Rectangle Select" ||
    tool === "Ellipse Select" ||
    tool === "Lasso Select" ||
    tool === "Magic Select"
  );
}

function toSelectionMode(value: string): SelectionMode {
  if (value === "add" || value === "subtract" || value === "intersect") {
    return value;
  }

  return "replace";
}

function promptPositiveNumber(label: string, fallback: number) {
  const value = window.prompt(label, String(fallback));

  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function MenuSeparator() {
  return <div className="my-1 h-px bg-[#2b3037]" role="separator" />;
}

function formatCanvasSize(size: { height: number; width: number }) {
  return `${Math.round(size.width)} x ${Math.round(size.height)} px`;
}

function isImageLayerSummary(
  layer: LayerSummary | null
): layer is LayerSummary & {
  canRestoreOriginalPixels: boolean;
  imagePixelHeight: number;
  imagePixelWidth: number;
} {
  return Boolean(layer && layer.type === "image" && "imagePixelWidth" in layer);
}

function closeAllMenus(root: HTMLElement) {
  for (const menu of root.querySelectorAll("details.toolbar-menu")) {
    menu.removeAttribute("open");
  }
}

const toolbarButtonClass =
  "block cursor-default list-none rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-[13px] text-[#d9dde3] hover:border-[#4c535c] hover:bg-[#252930] focus-visible:border-[#4c535c] focus-visible:bg-[#252930] [&::-webkit-details-marker]:hidden [.toolbar-menu[open]_&]:border-[#4c535c] [.toolbar-menu[open]_&]:bg-[#252930]";

const toolbarMenuClass =
  "absolute left-0 top-[calc(100%+6px)] z-10 grid w-[280px] rounded-lg border border-[#33373d] bg-[#17191d] p-1.5 shadow-[0_18px_34px_rgba(0,0,0,0.35)]";

const toolbarMenuItemClass =
  "flex w-full items-center justify-between gap-3 rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-left text-[13px] text-[#eef1f4] hover:border-[#4c535c] hover:bg-[#252930] focus-visible:border-[#4c535c] focus-visible:bg-[#252930] disabled:cursor-not-allowed disabled:text-[#6f7680] disabled:hover:border-transparent disabled:hover:bg-transparent";

const toolbarMenuHintClass = "ml-auto text-[10px] uppercase tracking-normal text-[#7f8791]";

const maskBrushInputClass =
  "w-[74px] rounded-md border border-[#33373d] bg-[#101113] px-[7px] py-1.5 text-[#eef1f4] font-[inherit]";

const statusPillClass = "rounded-lg border border-[#33373d] bg-[#22252a] px-2.5 py-[7px]";

const statusButtonClass =
  "rounded-lg border border-[#33373d] bg-[#22252a] px-2.5 py-[7px] text-[#c9cdd2] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]";

function getSaveStatusLabel(status: SaveStatus) {
  if (status === "saving") {
    return "Saving...";
  }

  if (status === "saved") {
    return "Saved";
  }

  return "Save failed";
}
