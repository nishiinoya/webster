import { FormEvent, useRef, useState } from "react";
import type { NewDocumentSize } from "../editorDocuments";
import {
  builtInProjectTemplates,
  type BuiltInProjectTemplate,
  type UserProjectTemplateSummary
} from "../../projects/projectTemplates";
import { cn } from "../classNames";

type NewDocumentDialogProps = {
  canInsertUserTemplate: boolean;
  onClose: () => void;
  onCreate: (size: NewDocumentSize) => void;
  onCreateFromUserTemplate: (template: UserProjectTemplateSummary) => void;
  onDeleteUserTemplate: (template: UserProjectTemplateSummary) => void;
  onExportUserTemplate: (template: UserProjectTemplateSummary) => void;
  onImportUserTemplate: (file: File) => void;
  onInsertUserTemplate: (template: UserProjectTemplateSummary) => void;
  onRenameUserTemplate: (template: UserProjectTemplateSummary, name: string) => void;
  userTemplates: UserProjectTemplateSummary[];
};

export function NewDocumentDialog({
  canInsertUserTemplate,
  onClose,
  onCreate,
  onCreateFromUserTemplate,
  onDeleteUserTemplate,
  onExportUserTemplate,
  onImportUserTemplate,
  onInsertUserTemplate,
  onRenameUserTemplate,
  userTemplates
}: NewDocumentDialogProps) {
  const templateImportInputRef = useRef<HTMLInputElement | null>(null);
  const firstTemplate = builtInProjectTemplates[0];
  const [activeBuiltInTemplateId, setActiveBuiltInTemplateId] = useState<string | null>(
    firstTemplate?.id ?? null
  );
  const [width, setWidth] = useState(firstTemplate?.width ?? 1200);
  const [height, setHeight] = useState(firstTemplate?.height ?? 800);
  const activeBuiltInTemplate =
    builtInProjectTemplates.find((template) => template.id === activeBuiltInTemplateId) ?? null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onCreate({
      height: clampDocumentSize(height),
      width: clampDocumentSize(width)
    });
  }

  function selectBuiltInTemplate(template: BuiltInProjectTemplate) {
    setActiveBuiltInTemplateId(template.id);
    setWidth(template.width);
    setHeight(template.height);
  }

  function updateWidth(value: string) {
    setActiveBuiltInTemplateId(null);
    setWidth(Number(value));
  }

  function updateHeight(value: string) {
    setActiveBuiltInTemplateId(null);
    setHeight(Number(value));
  }

  function renameTemplate(template: UserProjectTemplateSummary) {
    const name = window.prompt("Template name", template.name);

    if (name !== null) {
      onRenameUserTemplate(template, name);
    }
  }

  function deleteTemplate(template: UserProjectTemplateSummary) {
    if (window.confirm(`Delete template "${template.name}"?`)) {
      onDeleteUserTemplate(template);
    }
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-6" role="presentation">
      <form
        className="grid max-h-[min(820px,calc(100vh-48px))] w-[min(920px,100%)] gap-4 overflow-auto rounded-lg border border-[#383e46] bg-[#17191d] p-[18px] shadow-[0_24px_48px_rgba(0,0,0,0.42)]"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold text-[#f2f4f7]">New project</h2>
            <p className="m-0 mt-1 text-[12px] font-bold text-[#8b929b]">
              Templates create a new project copy; saved templates stay unchanged.
            </p>
          </div>
          <button
            className={dialogButtonClass}
            aria-label="Close new project dialog"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <section className={dialogSectionClass} aria-label="Built-in templates">
            <div className="flex items-center justify-between gap-3">
              <h3 className={dialogSectionTitleClass}>Built-in templates</h3>
              <span className="text-[11px] font-bold uppercase text-[#8b929b]">
                {activeBuiltInTemplate ? activeBuiltInTemplate.category : "Custom"}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
              {builtInProjectTemplates.map((template) => (
                <button
                  aria-pressed={template.id === activeBuiltInTemplateId}
                  className={cn(
                    "grid min-h-[92px] content-between rounded-lg border border-[#30353d] bg-[#202329] p-3 text-left hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]",
                    template.id === activeBuiltInTemplateId && "border-[#4aa391] bg-[#203731]"
                  )}
                  key={template.id}
                  onClick={() => selectBuiltInTemplate(template)}
                  type="button"
                >
                  <span className="text-[13px] font-extrabold text-[#eef1f4]">
                    {template.name}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#9aa1ab]">
                    <span>
                      {template.width} x {template.height}
                    </span>
                    <span>{template.preview}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="grid gap-3 rounded-lg border border-[#30353d] bg-[#111317] p-3">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-[13px] text-[#f2f4f7]">
                  {activeBuiltInTemplate?.name ?? "Custom size"}
                </strong>
                <span className="text-[11px] font-bold uppercase text-[#8b929b]">
                  {Math.round(width)} x {Math.round(height)} px
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-[7px] text-[13px] font-bold text-[#c9cdd2]">
                  <span>Width</span>
                  <input
                    className={dialogInputClass}
                    min={1}
                    onChange={(event) => updateWidth(event.target.value)}
                    type="number"
                    value={width}
                  />
                </label>
                <label className="grid gap-[7px] text-[13px] font-bold text-[#c9cdd2]">
                  <span>Height</span>
                  <input
                    className={dialogInputClass}
                    min={1}
                    onChange={(event) => updateHeight(event.target.value)}
                    type="number"
                    value={height}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className={dialogSectionClass} aria-label="User templates">
            <div className="flex items-center justify-between gap-3">
              <h3 className={dialogSectionTitleClass}>User templates</h3>
              <button
                className={dialogSmallButtonClass}
                onClick={() => templateImportInputRef.current?.click()}
                type="button"
              >
                Import...
              </button>
            </div>
            {userTemplates.length > 0 ? (
              <div className="grid gap-2">
                {userTemplates.map((template) => (
                  <article
                    className="grid gap-2 rounded-lg border border-[#30353d] bg-[#202329] p-3"
                    key={template.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="m-0 truncate text-[13px] font-extrabold text-[#eef1f4]">
                          {template.name}
                        </h4>
                        <p className="m-0 mt-1 text-[11px] font-bold text-[#8b929b]">
                          {template.width} x {template.height} px
                        </p>
                      </div>
                      <button
                        className={dialogButtonClass}
                        onClick={() => onCreateFromUserTemplate(template)}
                        type="button"
                      >
                        Use
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canInsertUserTemplate ? (
                        <button
                          className={dialogSmallButtonClass}
                          onClick={() => onInsertUserTemplate(template)}
                          type="button"
                        >
                          Insert group
                        </button>
                      ) : null}
                      <button
                        className={dialogSmallButtonClass}
                        onClick={() => renameTemplate(template)}
                        type="button"
                      >
                        Rename
                      </button>
                      <button
                        className={dialogSmallButtonClass}
                        onClick={() => onExportUserTemplate(template)}
                        type="button"
                      >
                        Export
                      </button>
                      <button
                        className={dialogSmallButtonClass}
                        onClick={() => deleteTemplate(template)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="m-0 rounded-lg border border-[#30353d] bg-[#202329] p-3 text-[13px] font-bold text-[#8b929b]">
                No saved templates yet. Import one or save the current project as a template.
              </p>
            )}
            <input
              ref={templateImportInputRef}
              accept=".webster,application/zip,application/vnd.webster.project"
              className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  onImportUserTemplate(file);
                  event.target.value = "";
                }
              }}
              type="file"
            />
          </section>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button className={dialogButtonClass} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={dialogButtonClass} type="submit">
            Create blank project
          </button>
        </div>
      </form>
    </div>
  );
}

const dialogSectionClass =
  "grid content-start gap-3 rounded-lg border border-[#2d3137] bg-[#17191d] p-3";

const dialogSectionTitleClass =
  "m-0 text-xs font-extrabold uppercase tracking-normal text-[#cfd4da]";

const dialogButtonClass =
  "rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]";

const dialogSmallButtonClass =
  "rounded-md border border-[#333941] bg-[#171a1f] px-2.5 py-1.5 text-[11px] font-bold text-[#dce1e6] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]";

const dialogInputClass =
  "w-full rounded-md border border-[#30353d] bg-[#101113] px-2.5 py-[9px] text-[#eef1f4]";

function clampDocumentSize(value: number) {
  if (!Number.isFinite(value)) {
    return 800;
  }

  return Math.min(Math.max(Math.round(value), 1), 12000);
}
