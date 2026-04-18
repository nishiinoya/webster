import { FormEvent, useState } from "react";
import type { NewDocumentSize } from "../editorDocuments";

type NewDocumentDialogProps = {
  onClose: () => void;
  onCreate: (size: NewDocumentSize) => void;
};

export function NewDocumentDialog({ onClose, onCreate }: NewDocumentDialogProps) {
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(800);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onCreate({
      height: clampDocumentSize(height),
      width: clampDocumentSize(width)
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
          <h2 className="m-0 text-lg font-bold text-[#f2f4f7]">New document</h2>
          <button
            className={dialogButtonClass}
            aria-label="Close new document dialog"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <label className="grid gap-[7px] text-[13px] font-bold text-[#c9cdd2]">
          <span>Width</span>
          <input
            className={dialogInputClass}
            min={1}
            onChange={(event) => setWidth(Number(event.target.value))}
            type="number"
            value={width}
          />
        </label>
        <label className="grid gap-[7px] text-[13px] font-bold text-[#c9cdd2]">
          <span>Height</span>
          <input
            className={dialogInputClass}
            min={1}
            onChange={(event) => setHeight(Number(event.target.value))}
            type="number"
            value={height}
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <button className={dialogButtonClass} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={dialogButtonClass} type="submit">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

const dialogButtonClass =
  "rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]";

const dialogInputClass =
  "w-full rounded-md border border-[#30353d] bg-[#101113] px-2.5 py-[9px] text-[#eef1f4]";

function clampDocumentSize(value: number) {
  if (!Number.isFinite(value)) {
    return 800;
  }

  return Math.min(Math.max(Math.round(value), 1), 12000);
}
