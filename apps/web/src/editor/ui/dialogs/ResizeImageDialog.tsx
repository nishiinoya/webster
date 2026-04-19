import { FormEvent, useMemo, useState } from "react";

type ResizeImageDialogProps = {
  canRestoreOriginalPixels: boolean;
  height: number;
  layerName: string;
  onClose: () => void;
  onResize: (size: { height: number; width: number }) => void;
  onRestoreOriginal: () => void;
  originalHeight: number;
  originalWidth: number;
  width: number;
};

export function ResizeImageDialog({
  canRestoreOriginalPixels,
  height,
  layerName,
  onClose,
  onResize,
  onRestoreOriginal,
  originalHeight,
  originalWidth,
  width
}: ResizeImageDialogProps) {
  const [isLinked, setIsLinked] = useState(true);
  const [nextHeight, setNextHeight] = useState(Math.round(height));
  const [nextWidth, setNextWidth] = useState(Math.round(width));
  const aspectRatio = useMemo(() => width / Math.max(1, height), [height, width]);

  function updateWidth(value: number) {
    const clampedWidth = clampImagePixels(value);

    setNextWidth(clampedWidth);

    if (isLinked) {
      setNextHeight(clampImagePixels(clampedWidth / aspectRatio));
    }
  }

  function updateHeight(value: number) {
    const clampedHeight = clampImagePixels(value);

    setNextHeight(clampedHeight);

    if (isLinked) {
      setNextWidth(clampImagePixels(clampedHeight * aspectRatio));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onResize({
      height: clampImagePixels(nextHeight),
      width: clampImagePixels(nextWidth)
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold text-[#f2f4f7]">Resize image pixels</h2>
            <p className="m-0 mt-1 text-xs font-bold text-[#8b929b]">
              {layerName}: {Math.round(width)} x {Math.round(height)} px
            </p>
          </div>
          <button
            aria-label="Close resize image dialog"
            className={dialogButtonClass}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2.5">
          <label className="grid gap-[7px] text-[13px] font-bold text-[#c9cdd2]">
            <span>Width</span>
            <input
              className={dialogInputClass}
              min={1}
              onChange={(event) => updateWidth(Number(event.target.value))}
              type="number"
              value={nextWidth}
            />
          </label>
          <button
            aria-pressed={isLinked}
            className={`${dialogButtonClass} min-w-[72px]`}
            onClick={() => setIsLinked((current) => !current)}
            type="button"
          >
            {isLinked ? "Linked" : "Free"}
          </button>
          <label className="grid gap-[7px] text-[13px] font-bold text-[#c9cdd2]">
            <span>Height</span>
            <input
              className={dialogInputClass}
              min={1}
              onChange={(event) => updateHeight(Number(event.target.value))}
              type="number"
              value={nextHeight}
            />
          </label>
        </div>
        <p className="m-0 rounded-lg border border-[#5a4530] bg-[#19140d] px-3 py-2 text-xs font-bold text-[#d7b98c]">
          This changes the actual image pixels. Downscaling can permanently remove detail from the
          working image.
        </p>
        <p className="m-0 rounded-lg border border-[#30353d] bg-[#101113] px-3 py-2 text-xs font-bold text-[#8b929b]">
          Original stored: {Math.round(originalWidth)} x {Math.round(originalHeight)} px. Resizing
          keeps the layer the same visible size on the canvas.
        </p>
        <div className="flex items-center justify-between gap-3">
          <button
            className={dialogButtonClass}
            disabled={!canRestoreOriginalPixels}
            onClick={onRestoreOriginal}
            type="button"
          >
            Revert to original pixels
          </button>
          <div className="flex items-center gap-2">
            <button className={dialogButtonClass} onClick={onClose} type="button">
              Cancel
            </button>
            <button className={dialogButtonClass} type="submit">
              Resize pixels
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

const dialogButtonClass =
  "rounded-lg border border-[#333941] bg-[#202329] px-3 py-2 font-bold text-[#eef1f4] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731] disabled:cursor-not-allowed disabled:text-[#6f7680] disabled:hover:border-[#333941] disabled:hover:bg-[#202329] aria-pressed:border-[#4aa391] aria-pressed:bg-[#203731]";

const dialogInputClass =
  "w-full rounded-md border border-[#30353d] bg-[#101113] px-2.5 py-[9px] text-[#eef1f4]";

function clampImagePixels(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(Math.round(value), 1), 12000);
}
