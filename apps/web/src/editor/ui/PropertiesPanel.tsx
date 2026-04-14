import type { LayerCommand, LayerSummary } from "../core/EditorApp";

type PropertiesPanelProps = {
  onLayerCommand: (command: LayerCommand) => void;
  selectedLayer: LayerSummary | null;
  selectedTool: string;
};

type NumericField = "height" | "opacity" | "rotation" | "width" | "x" | "y";

export function PropertiesPanel({
  onLayerCommand,
  selectedLayer,
  selectedTool
}: PropertiesPanelProps) {
  function updateSelectedLayer(updates: Extract<LayerCommand, { type: "update" }>["updates"]) {
    if (!selectedLayer) {
      return;
    }

    onLayerCommand({ type: "update", layerId: selectedLayer.id, updates });
  }

  function updateNumber(field: NumericField, value: string) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      return;
    }

    updateSelectedLayer({
      [field]: field === "opacity" ? numberValue / 100 : numberValue
    });
  }

  return (
    <section className="editor-panel" aria-label="Properties panel">
      <div className="panel-header">
        <h2>Properties</h2>
      </div>
      <div className="property-list">
        <div>
          <span>Tool</span>
          <strong>{selectedTool}</strong>
        </div>
        <label>
          <span>Layer</span>
          <input
            disabled={!selectedLayer}
            onChange={(event) => updateSelectedLayer({ name: event.target.value })}
            value={selectedLayer?.name ?? ""}
          />
        </label>
        <label>
          <span>X</span>
          <input
            disabled={!selectedLayer || selectedLayer.locked}
            onChange={(event) => updateNumber("x", event.target.value)}
            type="number"
            value={selectedLayer ? Math.round(selectedLayer.x) : ""}
          />
        </label>
        <label>
          <span>Y</span>
          <input
            disabled={!selectedLayer || selectedLayer.locked}
            onChange={(event) => updateNumber("y", event.target.value)}
            type="number"
            value={selectedLayer ? Math.round(selectedLayer.y) : ""}
          />
        </label>
        <label>
          <span>Width</span>
          <input
            disabled={!selectedLayer || selectedLayer.locked}
            min="1"
            onChange={(event) => updateNumber("width", event.target.value)}
            type="number"
            value={selectedLayer ? Math.round(selectedLayer.width) : ""}
          />
        </label>
        <label>
          <span>Height</span>
          <input
            disabled={!selectedLayer || selectedLayer.locked}
            min="1"
            onChange={(event) => updateNumber("height", event.target.value)}
            type="number"
            value={selectedLayer ? Math.round(selectedLayer.height) : ""}
          />
        </label>
        <label>
          <span>Rotation</span>
          <input
            disabled={!selectedLayer || selectedLayer.locked}
            onChange={(event) => updateNumber("rotation", event.target.value)}
            type="number"
            value={selectedLayer ? Math.round(selectedLayer.rotation) : ""}
          />
        </label>
        <label>
          <span>Opacity</span>
          <input
            disabled={!selectedLayer}
            max="100"
            min="0"
            onChange={(event) => updateNumber("opacity", event.target.value)}
            type="number"
            value={selectedLayer ? Math.round(selectedLayer.opacity * 100) : ""}
          />
        </label>
        <div className="property-toggle-row">
          <span>Visible</span>
          <button
            disabled={!selectedLayer}
            onClick={() => updateSelectedLayer({ visible: !selectedLayer?.isVisible })}
            type="button"
          >
            {selectedLayer?.isVisible ? "Shown" : "Hidden"}
          </button>
        </div>
        <div className="property-toggle-row">
          <span>Locked</span>
          <button
            disabled={!selectedLayer}
            onClick={() => updateSelectedLayer({ locked: !selectedLayer?.locked })}
            type="button"
          >
            {selectedLayer?.locked ? "Locked" : "Unlocked"}
          </button>
        </div>
        <div>
          <span>Mask</span>
          <strong>
            {selectedLayer?.hasMask
              ? selectedLayer.maskEnabled
                ? "Enabled"
                : "Disabled"
              : "None"}
          </strong>
        </div>
      </div>
    </section>
  );
}
