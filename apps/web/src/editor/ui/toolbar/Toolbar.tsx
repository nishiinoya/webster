import type { MouseEvent as ReactMouseEvent } from "react";
import { useRef } from "react";
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
import { cn } from "../classNames";

type ToolbarProps = {
  canEditDocument: boolean;
  documentTitle: string;
  onNewDocument: () => void;
  onOpenExportDialog: () => void;
  onOpenProject: (file: File, handle?: WebsterFileHandle | null) => void;
  onSaveAsProject: () => void;
  onSaveProject: () => void;
  onAddAdjustmentLayer: () => void;
  onSelectionCommand: (command: SelectionCommand) => void;
  onSelectTool: (tool: string) => void;
  onUploadImage: (file: File) => void;
  maskBrushOptions: MaskBrushOptions;
  onMaskBrushOptionsChange: (options: Partial<MaskBrushOptions>) => void;
  onStrokeColorChange: (color: [number, number, number, number]) => void;
  onStrokeModeChange: (mode: "draw" | "erase") => void;
  onStrokeStyleChange: (style: StrokeStyle) => void;
  onStrokeTargetChange: (target: StrokeTargetSelection) => void;
  onStrokeWidthChange: (width: number) => void;
  saveStatus: SaveStatus;
  selectedStrokeColor: [number, number, number, number];
  selectedStrokeMode: "draw" | "erase";
  selectedStrokeStyle: StrokeStyle;
  selectedStrokeTargetLayerId: string | null;
  selectedStrokeTargetMode: "layer" | "new" | "selected";
  selectedStrokeWidth: number;
  selectedTool: string;
  strokeLayers: LayerSummary[];
  zoomPercentage: number;
};

export type StrokeTargetSelection = {
  layerId: string | null;
  mode: "layer" | "new" | "selected";
};

export function Toolbar({
  canEditDocument,
  documentTitle,
  onNewDocument,
  onOpenExportDialog,
  onOpenProject,
  onSaveAsProject,
  onSaveProject,
  onAddAdjustmentLayer,
  onSelectionCommand,
  onSelectTool,
  onUploadImage,
  maskBrushOptions,
  onMaskBrushOptionsChange,
  onStrokeColorChange,
  onStrokeModeChange,
  onStrokeStyleChange,
  onStrokeTargetChange,
  onStrokeWidthChange,
  saveStatus,
  selectedStrokeColor,
  selectedStrokeMode,
  selectedStrokeStyle,
  selectedStrokeTargetLayerId,
  selectedStrokeTargetMode,
  selectedStrokeWidth,
  selectedTool,
  strokeLayers,
  zoomPercentage
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileMenuRef = useRef<HTMLDetailsElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <header
      className="grid grid-cols-[minmax(180px,auto)_minmax(0,1fr)_auto] items-center gap-[18px] border-b border-[#2a2d31] bg-[#17191d] px-4 py-2.5 max-[980px]:grid-cols-[minmax(160px,auto)_minmax(0,1fr)] max-[760px]:min-h-[118px] max-[760px]:grid-cols-1"
      aria-label="Top toolbar"
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
        <details className="toolbar-menu relative" ref={fileMenuRef}>
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
                onOpenExportDialog();
              }}
              type="button"
            >
              Export as...
            </button>
          </div>
        </details>
        <details className="toolbar-menu relative">
          <summary className={toolbarButtonClass}>Edit</summary>
          <div className={toolbarMenuClass} role="menu">
            <button className={toolbarMenuItemClass} disabled type="button">
              Undo <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Redo <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <MenuSeparator />
            <button className={toolbarMenuItemClass} disabled type="button">
              Cut <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Copy <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <button className={toolbarMenuItemClass} disabled type="button">
              Paste <span className={toolbarMenuHintClass}>TODO</span>
            </button>
            <MenuSeparator />
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectTool("Move");
              }}
              type="button"
            >
              Move / transform tool
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectTool("Draw");
              }}
              type="button"
            >
              Draw tool
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={(event) => {
                closeMenu(event);
                onSelectTool("Text");
              }}
              type="button"
            >
              Text tool
            </button>
          </div>
        </details>
        <details className="toolbar-menu relative">
          <summary className={toolbarButtonClass}>View</summary>
          <div className={toolbarMenuClass} role="menu">
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
            <button className={toolbarMenuItemClass} disabled type="button">
              Rulers and guides <span className={toolbarMenuHintClass}>TODO</span>
            </button>
          </div>
        </details>
        <details className="toolbar-menu relative">
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
        <details className="toolbar-menu relative">
          <summary className={toolbarButtonClass}>Select</summary>
          <div className={toolbarMenuClass} role="menu">
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => onSelectionCommand("clear")}
              type="button"
            >
              Clear selection
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => onSelectionCommand("invert")}
              type="button"
            >
              Invert selection
            </button>
            <button
              className={toolbarMenuItemClass}
              disabled={!canEditDocument}
              onClick={() => onSelectionCommand("convert-to-mask")}
              type="button"
            >
              Convert to mask
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
      <div
        className="flex items-center justify-end gap-2 text-[13px] text-[#c9cdd2] max-[980px]:hidden"
        aria-label="Current editor status"
      >
        {saveStatus !== "idle" ? <span className={statusPillClass}>{getSaveStatusLabel(saveStatus)}</span> : null}
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

function MenuSeparator() {
  return <div className="my-1 h-px bg-[#2b3037]" role="separator" />;
}

const toolbarButtonClass =
  "block cursor-default list-none rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-[13px] text-[#d9dde3] hover:border-[#4c535c] hover:bg-[#252930] focus-visible:border-[#4c535c] focus-visible:bg-[#252930] [&::-webkit-details-marker]:hidden [.toolbar-menu[open]_&]:border-[#4c535c] [.toolbar-menu[open]_&]:bg-[#252930]";

const toolbarMenuClass =
  "absolute left-0 top-[calc(100%+6px)] z-10 grid w-[250px] rounded-lg border border-[#33373d] bg-[#17191d] p-1.5 shadow-[0_18px_34px_rgba(0,0,0,0.35)]";

const toolbarMenuItemClass =
  "flex w-full items-center justify-between gap-3 rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-left text-[13px] text-[#eef1f4] hover:border-[#4c535c] hover:bg-[#252930] focus-visible:border-[#4c535c] focus-visible:bg-[#252930] disabled:cursor-not-allowed disabled:text-[#6f7680] disabled:hover:border-transparent disabled:hover:bg-transparent";

const toolbarMenuHintClass = "ml-auto text-[10px] uppercase tracking-normal text-[#7f8791]";

const maskBrushInputClass =
  "w-[74px] rounded-md border border-[#33373d] bg-[#101113] px-[7px] py-1.5 text-[#eef1f4] font-[inherit]";

const statusPillClass = "rounded-lg border border-[#33373d] bg-[#22252a] px-2.5 py-[7px]";

function getSaveStatusLabel(status: SaveStatus) {
  if (status === "saving") {
    return "Saving...";
  }

  if (status === "saved") {
    return "Saved";
  }

  return "Save failed";
}
