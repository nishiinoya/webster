import { FormEvent, useState } from "react";
import type { ImageExportBackground, ImageExportFormat } from "../../app/EditorApp";

type ExportImageDialogProps = {
  onClose: () => void;
  onExport: (options: { background: ImageExportBackground; format: ImageExportFormat }) => void;
};

export function ExportImageDialog({ onClose, onExport }: ExportImageDialogProps) {
  const [format, setFormat] = useState<ImageExportFormat>("png");
  const [jpegBackground, setJpegBackground] = useState<"checkerboard" | "white">("white");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onExport({
      background: format === "png" ? "transparent" : jpegBackground,
      format
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="document-dialog" onSubmit={submit} role="dialog" aria-modal="true">
        <div className="document-dialog-header">
          <h2>Export as</h2>
          <button aria-label="Close export dialog" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <fieldset className="dialog-fieldset">
          <legend>Format</legend>
          <label className="dialog-radio">
            <input
              checked={format === "png"}
              onChange={() => setFormat("png")}
              type="radio"
            />
            <span>PNG</span>
            <strong>Transparent background</strong>
          </label>
          <label className="dialog-radio">
            <input
              checked={format === "jpeg"}
              onChange={() => setFormat("jpeg")}
              type="radio"
            />
            <span>JPEG</span>
            <strong>Choose white or checkerboard</strong>
          </label>
        </fieldset>
        <fieldset className="dialog-fieldset" disabled={format !== "jpeg"}>
          <legend>JPEG background</legend>
          <label className="dialog-radio">
            <input
              checked={jpegBackground === "white"}
              onChange={() => setJpegBackground("white")}
              type="radio"
            />
            <span>White</span>
          </label>
          <label className="dialog-radio">
            <input
              checked={jpegBackground === "checkerboard"}
              onChange={() => setJpegBackground("checkerboard")}
              type="radio"
            />
            <span>Checkerboard</span>
          </label>
        </fieldset>
        <div className="document-dialog-actions">
          <button onClick={onClose} type="button">
            Cancel
          </button>
          <button type="submit">Export</button>
        </div>
      </form>
    </div>
  );
}
