import { useRef } from "react";
import {
  canPickProjectFileHandle,
  pickProjectFileWithHandle
} from "../../projects/projectFiles";
import type { WebsterFileHandle } from "../../projects/projectFiles";
import type { SaveStatus } from "../hooks/useProjectFileActions";
import type { MaskBrushOptions } from "../../tools/mask-brush/MaskBrushTypes";
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
  onSelectionCommand: (command: SelectionCommand) => void;
  onUploadImage: (file: File) => void;
  maskBrushOptions: MaskBrushOptions;
  onMaskBrushOptionsChange: (options: Partial<MaskBrushOptions>) => void;
  saveStatus: SaveStatus;
  selectedTool: string;
  zoomPercentage: number;
};

const toolbarActions = ["Edit", "View", "Filter"];

export function Toolbar({
  canEditDocument,
  documentTitle,
  onNewDocument,
  onOpenExportDialog,
  onOpenProject,
  onSaveAsProject,
  onSaveProject,
  onSelectionCommand,
  onUploadImage,
  maskBrushOptions,
  onMaskBrushOptionsChange,
  saveStatus,
  selectedTool,
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
        {toolbarActions.map((action) => (
          <button className={toolbarButtonClass} key={action} type="button">
            {action}
          </button>
        ))}
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

const toolbarButtonClass =
  "block cursor-default list-none rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-[13px] text-[#d9dde3] hover:border-[#4c535c] hover:bg-[#252930] focus-visible:border-[#4c535c] focus-visible:bg-[#252930] [&::-webkit-details-marker]:hidden [.toolbar-menu[open]_&]:border-[#4c535c] [.toolbar-menu[open]_&]:bg-[#252930]";

const toolbarMenuClass =
  "absolute left-0 top-[calc(100%+6px)] z-10 grid w-[220px] rounded-lg border border-[#33373d] bg-[#17191d] p-1.5 shadow-[0_18px_34px_rgba(0,0,0,0.35)]";

const toolbarMenuItemClass =
  "w-full rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-left text-[13px] text-[#eef1f4] hover:border-[#4c535c] hover:bg-[#252930] focus-visible:border-[#4c535c] focus-visible:bg-[#252930] disabled:cursor-not-allowed disabled:text-[#6f7680] disabled:hover:border-transparent disabled:hover:bg-transparent";

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
