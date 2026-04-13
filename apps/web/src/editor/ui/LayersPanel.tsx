type Layer = {
  id: string;
  name: string;
  isVisible: boolean;
  isSelected: boolean;
};

type LayersPanelProps = {
  layers: Layer[];
};

export function LayersPanel({ layers }: LayersPanelProps) {
  return (
    <section className="editor-panel" aria-label="Layers panel">
      <div className="panel-header">
        <h2>Layers</h2>
        <span>{layers.length}</span>
      </div>
      <div className="layer-list">
        {layers.map((layer) => (
          <button
            aria-pressed={layer.isSelected}
            className="layer-row"
            key={layer.id}
            type="button"
          >
            <span className="visibility-dot" aria-label={layer.isVisible ? "Visible" : "Hidden"} />
            <span className="layer-thumbnail" aria-hidden="true" />
            <span>{layer.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
