type Layer = {
  id: string;
  name: string;
  isVisible: boolean;
  isSelected: boolean;
  type: string;
};

type LayersPanelProps = {
  layers: Layer[];
  onSelectLayer: (layerId: string) => void;
};

export function LayersPanel({ layers, onSelectLayer }: LayersPanelProps) {
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
            onClick={() => onSelectLayer(layer.id)}
            type="button"
          >
            <span className="visibility-dot" aria-label={layer.isVisible ? "Visible" : "Hidden"} />
            <span className={`layer-thumbnail layer-thumbnail-${layer.type}`} aria-hidden="true" />
            <span>{layer.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
