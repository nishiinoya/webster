import type { ChangeEvent, MouseEvent } from "react";
import type { LayerCommand, LayerSummary } from "../core/EditorApp";

type LayersPanelProps = {
  layers: LayerSummary[];
  onLayerCommand: (command: LayerCommand) => void;
  onSelectLayer: (layerId: string) => void;
};

export function LayersPanel({ layers, onLayerCommand, onSelectLayer }: LayersPanelProps) {
  function stopPanelControl(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function updateLayer(layerId: string, updates: Extract<LayerCommand, { type: "update" }>["updates"]) {
    onLayerCommand({ type: "update", layerId, updates });
  }

  return (
    <section className="editor-panel" aria-label="Layers panel">
      <div className="panel-header">
        <h2>Layers</h2>
        <span>{layers.length}</span>
      </div>
      <div className="layer-list">
        {layers.map((layer) => (
          <div
            aria-selected={layer.isSelected}
            className="layer-row"
            key={layer.id}
            onClick={() => onSelectLayer(layer.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectLayer(layer.id);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <button
              aria-label={layer.isVisible ? `Hide ${layer.name}` : `Show ${layer.name}`}
              className="layer-icon-button"
              onClick={(event) => {
                stopPanelControl(event);
                updateLayer(layer.id, { visible: !layer.isVisible });
              }}
              type="button"
            >
              {layer.isVisible ? "Hide" : "Show"}
            </button>
            <span className={`layer-thumbnail layer-thumbnail-${layer.type}`} aria-hidden="true" />
            <input
              aria-label={`Rename ${layer.name}`}
              className="layer-name-input"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateLayer(layer.id, { name: event.target.value })
              }
              onClick={stopPanelControl}
              value={layer.name}
            />
            <div className="layer-row-controls" onClick={stopPanelControl}>
              <button
                aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                className="layer-icon-button"
                onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                type="button"
              >
                {layer.locked ? "Unlock" : "Lock"}
              </button>
              <button
                aria-label={`Move ${layer.name} up`}
                className="layer-icon-button"
                onClick={() => onLayerCommand({ type: "move-up", layerId: layer.id })}
                type="button"
              >
                Up
              </button>
              <button
                aria-label={`Move ${layer.name} down`}
                className="layer-icon-button"
                onClick={() => onLayerCommand({ type: "move-down", layerId: layer.id })}
                type="button"
              >
                Down
              </button>
              <button
                aria-label={`Duplicate ${layer.name}`}
                className="layer-icon-button"
                onClick={() => onLayerCommand({ type: "duplicate", layerId: layer.id })}
                type="button"
              >
                Copy
              </button>
              <button
                aria-label={`Delete ${layer.name}`}
                className="layer-icon-button layer-icon-button-danger"
                onClick={() => onLayerCommand({ type: "delete", layerId: layer.id })}
                type="button"
              >
                Delete
              </button>
            </div>
            <div className="layer-mask-controls" onClick={stopPanelControl}>
              <button
                aria-label={layer.hasMask ? `Delete mask from ${layer.name}` : `Add mask to ${layer.name}`}
                className="layer-icon-button"
                onClick={() =>
                  onLayerCommand({
                    action: layer.hasMask ? "delete" : "add",
                    layerId: layer.id,
                    type: "mask"
                  })
                }
                type="button"
              >
                {layer.hasMask ? "Del mask" : "Add mask"}
              </button>
              <button
                aria-label={layer.maskEnabled ? `Disable ${layer.name} mask` : `Enable ${layer.name} mask`}
                className="layer-icon-button"
                disabled={!layer.hasMask}
                onClick={() =>
                  onLayerCommand({
                    action: "toggle-enabled",
                    layerId: layer.id,
                    type: "mask"
                  })
                }
                type="button"
              >
                {layer.maskEnabled ? "Mask on" : "Mask off"}
              </button>
              <button
                aria-label={`Invert ${layer.name} mask`}
                className="layer-icon-button"
                disabled={!layer.hasMask}
                onClick={() => onLayerCommand({ action: "invert", layerId: layer.id, type: "mask" })}
                type="button"
              >
                Invert
              </button>
              <button
                aria-label={`Clear ${layer.name} mask to white`}
                className="layer-icon-button"
                disabled={!layer.hasMask}
                onClick={() =>
                  onLayerCommand({ action: "clear-white", layerId: layer.id, type: "mask" })
                }
                type="button"
              >
                White
              </button>
              <button
                aria-label={`Clear ${layer.name} mask to black`}
                className="layer-icon-button"
                disabled={!layer.hasMask}
                onClick={() =>
                  onLayerCommand({ action: "clear-black", layerId: layer.id, type: "mask" })
                }
                type="button"
              >
                Black
              </button>
            </div>
            <label className="layer-opacity-control" onClick={stopPanelControl}>
              <span>Opacity</span>
              <input
                aria-label={`${layer.name} opacity`}
                max="100"
                min="0"
                onChange={(event) =>
                  updateLayer(layer.id, { opacity: Number(event.target.value) / 100 })
                }
                type="range"
                value={Math.round(layer.opacity * 100)}
              />
              <span>{Math.round(layer.opacity * 100)}%</span>
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
