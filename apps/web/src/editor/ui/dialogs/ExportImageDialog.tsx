import { FormEvent, useEffect, useState } from "react";
import type { ImageExportBackground, ImageExportFormat } from "../../app/EditorApp";

type ExportImageDialogProps = {
  onClose: () => void;
  onExport: (options: { background: ImageExportBackground; format: ImageExportFormat }) => void;
};

export function ExportImageDialog({ onClose, onExport }: ExportImageDialogProps) {
  const [format, setFormat] = useState<ImageExportFormat>("png");
  const [background, setBackground] = useState<ImageExportBackground>("white");

  useEffect(() => {
    if (format !== "png" && background === "transparent") {
      setBackground("white");
    }
  }, [background, format]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onExport({
      background,
      format
    });
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-6" role="presentation">
      <form
        className="grid w-[min(420px,100%)] gap-3.5 rounded-lg border border-[#383e46] bg-[#17191d] p-[18px] shadow-[0_24px_48px_rgba(0,0,0,0.42)]"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-bold text-[#f2f4f7]">Export as</h2>
          <button
            className={dialogButtonClass}
            aria-label="Close export dialog"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <fieldset className={dialogFieldsetClass}>
          <legend className={dialogLegendClass}>Format</legend>
          <label className={dialogRadioClass}>
            <input
              checked={format === "png"}
              onChange={() => setFormat("png")}
              type="radio"
            />
            <span>PNG</span>
            <strong className={dialogRadioHintClass}>Choose transparent or opaque</strong>
          </label>
          <label className={dialogRadioClass}>
            <input
              checked={format === "jpeg"}
              onChange={() => setFormat("jpeg")}
              type="radio"
            />
            <span>JPEG</span>
            <strong className={dialogRadioHintClass}>Choose white or checkerboard</strong>
          </label>
          <label className={dialogRadioClass}>
            <input
              checked={format === "pdf"}
              onChange={() => setFormat("pdf")}
              type="radio"
            />
            <span>PDF</span>
            <strong className={dialogRadioHintClass}>Single-page document</strong>
          </label>
        </fieldset>
        <fieldset className={dialogFieldsetClass}>
          <legend className={dialogLegendClass}>Background</legend>
          <label className={dialogRadioClass}>
            <input
              checked={background === "transparent"}
              disabled={format !== "png"}
              onChange={() => setBackground("transparent")}
              type="radio"
            />
            <span>Transparent</span>
            <strong className={dialogRadioHintClass}>PNG only</strong>
          </label>
          <label className={dialogRadioClass}>
            <input
              checked={background === "white"}
              onChange={() => setBackground("white")}
              type="radio"
            />
            <span>White</span>
          </label>
          <label className={dialogRadioClass}>
            <input
              checked={background === "checkerboard"}
              onChange={() => setBackground("checkerboard")}
              type="radio"
            />
            <span>Checkerboard</span>
          </label>
        </fieldset>
        <div className="flex items-center justify-between gap-3">
          <button className={dialogButtonClass} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={dialogButtonClass} type="submit">
            Export
          </button>
        </div>
      </form>
    </div>
  );
}

const dialogButtonClass =
  "rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]";

const dialogFieldsetClass =
  "grid gap-2 rounded-lg border border-[#30353d] p-2.5 disabled:opacity-[0.55]";

const dialogLegendClass = "px-[5px] text-xs font-extrabold text-[#9aa1ab]";

const dialogRadioClass =
  "grid min-h-8 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-[9px] rounded-md px-1.5 py-1 text-[13px] font-bold text-[#c9cdd2] hover:bg-[#202329] focus-within:bg-[#202329] [&>input]:m-0 [&>input]:w-auto";

const dialogRadioHintClass =
  "col-start-2 text-[11px] font-bold text-[#8f98a3]";
