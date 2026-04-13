type CanvasViewProps = {
  activeTabTitle: string;
  selectedTool: string;
};

export function CanvasView({ activeTabTitle, selectedTool }: CanvasViewProps) {
  return (
    <section className="canvas-view" aria-label="Main canvas placeholder">
      <div className="canvas-ruler canvas-ruler-horizontal" aria-hidden="true" />
      <div className="canvas-ruler canvas-ruler-vertical" aria-hidden="true" />
      <div className="canvas-stage">
        <div className="canvas-placeholder">
          <p className="canvas-label">{activeTabTitle}</p>
          <div className="canvas-frame" aria-hidden="true">
            <div className="canvas-frame-grid" />
          </div>
          <p className="canvas-meta">Canvas placeholder · {selectedTool} tool selected</p>
        </div>
      </div>
    </section>
  );
}
