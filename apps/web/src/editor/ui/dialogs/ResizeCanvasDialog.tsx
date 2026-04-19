import { FormEvent, useState } from "react";
import type { DocumentResizeAnchor } from "../../scene/Scene";

type ResizeCanvasDialogProps = {
  height: number;
  onClose: () => void;
  onResize: (size: { anchor: DocumentResizeAnchor; height: number; width: number }) => void;
  width: number;
};

const anchors: Array<{ label: string; value: DocumentResizeAnchor }> = [
  { label: "Top left", value: "top-left" },
  { label: "Top", value: "top" },
  { label: "Top right", value: "top-right" },
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
  { label: "Bottom left", value: "bottom-left" },
  { label: "Bottom", value: "bottom" },
  { label: "Bottom right", value: "bottom-right" }
];

export function ResizeCanvasDialog({
  height,
  onClose,
  onResize,
  width
}: ResizeCanvasDialogProps) {
  const [anchor, setAnchor] = useState<DocumentResizeAnchor>("center");
  const [nextHeight, setNextHeight] = useState(Math.round(height));
  const [nextWidth, setNextWidth] = useState(Math.round(width));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onResize({
      anchor,
      height: clampDocumentSize(nextHeight),
      width: clampDocumentSize(nextWidth)
    });
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-6" role="presentation">
      <form
        aria-modal="true"
        className="grid w-[min(460px,100%)] gap-3.5 rounded-lg border border-[#383e46] bg-[#17191d] p-[18px] shadow-[0_24px_48px_rgba(0,0,0,0.42)]"
        onSubmit={submit}
        role="dialog"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold text-[#f2f4f7]">Resize canvas</h2>
            <p className="m-0 mt-1 text-xs font-bold text-[#8b929b]">
              Changes document bounds, layers stay editable.
            </p>
          </div>
          <button
            aria-label="Close resize canvas dialog"
            className={dialogButtonClass}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-[7px] text-[13px] font-bold text-[#c9cdd2]">
            <span>Width</span>
            <input
              className={dialogInputClass}
              min={1}
              onChange={(event) => setNextWidth(Number(event.target.value))}
              type="number"
              value={nextWidth}
            />
          </label>
          <label className="grid gap-[7px] text-[13px] font-bold text-[#c9cdd2]">
            <span>Height</span>
            <input
              className={dialogInputClass}
              min={1}
              onChange={(event) => setNextHeight(Number(event.target.value))}
              type="number"
              value={nextHeight}
            />
          </label>
        </div>
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1 text-[13px] font-bold text-[#c9cdd2]">Anchor</legend>
          <div className="grid grid-cols-3 gap-2">
            {anchors.map((item) => (
              <label
                className="flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-[#333941] bg-[#202329] px-2 text-center text-xs font-bold text-[#eef1f4] has-[:checked]:border-[#4aa391] has-[:checked]:bg-[#203731]"
                key={item.value}
              >
                <input
                  checked={anchor === item.value}
                  className="sr-only"
                  onChange={() => setAnchor(item.value)}
                  type="radio"
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center justify-between gap-3">
          <button className={dialogButtonClass} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={dialogButtonClass} type="submit">
            Resize
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
