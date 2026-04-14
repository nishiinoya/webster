import { FormEvent, useState } from "react";
import type { NewDocumentSize } from "./editorDocuments";

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
    <div className="dialog-backdrop" role="presentation">
      <form className="document-dialog" onSubmit={submit} role="dialog" aria-modal="true">
        <div className="document-dialog-header">
          <h2>New document</h2>
          <button aria-label="Close new document dialog" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <label>
          <span>Width</span>
          <input
            min={1}
            onChange={(event) => setWidth(Number(event.target.value))}
            type="number"
            value={width}
          />
        </label>
        <label>
          <span>Height</span>
          <input
            min={1}
            onChange={(event) => setHeight(Number(event.target.value))}
            type="number"
            value={height}
          />
        </label>
        <div className="document-dialog-actions">
          <button onClick={onClose} type="button">
            Cancel
          </button>
          <button type="submit">Create</button>
        </div>
      </form>
    </div>
  );
}

function clampDocumentSize(value: number) {
  if (!Number.isFinite(value)) {
    return 800;
  }

  return Math.min(Math.max(Math.round(value), 1), 12000);
}
