import type { ChangeEvent, MouseEvent } from "react";
import type { LayerCommand, LayerSummary } from "../../app/EditorApp";

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
            <div className="layer-toggle-stack" onClick={stopPanelControl}>
              <button
                aria-label={layer.isVisible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                aria-pressed={layer.isVisible}
                className={`layer-toggle-button layer-toggle-button-visibility${
                  layer.isVisible ? " is-on" : ""
                }`}
                onClick={() => updateLayer(layer.id, { visible: !layer.isVisible })}
                type="button"
              >
                {layer.isVisible ? <EyeIcon /> : <EyeOffIcon />}
              </button>
              <button
                aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                aria-pressed={layer.locked}
                className={`layer-toggle-button layer-toggle-button-lock${
                  layer.locked ? " is-on" : ""
                }`}
                onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                type="button"
              >
                {layer.locked ? <LockIcon /> : <UnlockIcon />}
              </button>
            </div>
            <span className={`layer-thumbnail layer-thumbnail-${layer.type}`} aria-hidden="true" />
            <div className="layer-main">
              <input
                aria-label={`Rename ${layer.name}`}
                className="layer-name-input"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateLayer(layer.id, { name: event.target.value })
                }
                onClick={stopPanelControl}
                value={layer.name}
              />
              <div className="layer-meta-row">
                <span>{layer.type}</span>
                {layer.hasMask ? (
                  <button
                    className="layer-mask-chip"
                    onClick={(event) => {
                      stopPanelControl(event);
                      onLayerCommand({
                        action: "toggle-enabled",
                        layerId: layer.id,
                        type: "mask"
                      });
                    }}
                    type="button"
                  >
                    {layer.maskEnabled ? "Mask on" : "Mask off"}
                  </button>
                ) : null}
              </div>
            </div>
            <details className="layer-more-menu" onClick={stopPanelControl}>
              <summary aria-label={`Layer actions for ${layer.name}`}>...</summary>
              <div className="layer-more-menu-content">
                <button
                  onClick={() => onLayerCommand({ type: "move-up", layerId: layer.id })}
                  type="button"
                >
                  Move up
                </button>
                <button
                  onClick={() => onLayerCommand({ type: "move-down", layerId: layer.id })}
                  type="button"
                >
                  Move down
                </button>
                <button
                  onClick={() => onLayerCommand({ type: "duplicate", layerId: layer.id })}
                  type="button"
                >
                  Duplicate
                </button>
                <button
                  className="layer-danger-action"
                  onClick={() => onLayerCommand({ type: "delete", layerId: layer.id })}
                  type="button"
                >
                  Delete layer
                </button>
                <span className="layer-menu-separator" />
                <button
                  onClick={() =>
                    onLayerCommand({
                      action: layer.hasMask ? "delete" : "add",
                      layerId: layer.id,
                      type: "mask"
                    })
                  }
                  type="button"
                >
                  {layer.hasMask ? "Delete mask" : "Add mask"}
                </button>
                <button
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
                  {layer.maskEnabled ? "Disable mask" : "Enable mask"}
                </button>
                <button
                  disabled={!layer.hasMask}
                  onClick={() => onLayerCommand({ action: "invert", layerId: layer.id, type: "mask" })}
                  type="button"
                >
                  Invert mask
                </button>
                <button
                  disabled={!layer.hasMask}
                  onClick={() =>
                    onLayerCommand({ action: "clear-white", layerId: layer.id, type: "mask" })
                  }
                  type="button"
                >
                  Clear mask white
                </button>
                <button
                  disabled={!layer.hasMask}
                  onClick={() =>
                    onLayerCommand({ action: "clear-black", layerId: layer.id, type: "mask" })
                  }
                  type="button"
                >
                  Clear mask black
                </button>
              </div>
            </details>
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

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="layer-toggle-svg" viewBox="0 0 20 20">
      <path d="M2.4 10s2.7-4.6 7.6-4.6 7.6 4.6 7.6 4.6-2.7 4.6-7.6 4.6S2.4 10 2.4 10Z" />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" className="layer-toggle-svg" viewBox="0 0 20 20">
      <path d="M3 3l14 14" />
      <path d="M2.4 10s2.7-4.6 7.6-4.6c1.2 0 2.3.3 3.2.7" />
      <path d="M15.5 8.1c1.4 1 2.1 1.9 2.1 1.9s-2.7 4.6-7.6 4.6c-1.1 0-2.1-.2-3-.6" />
      <path d="M8.4 8.4a2.2 2.2 0 0 0 3.1 3.1" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className="layer-toggle-svg" viewBox="0 0 20 20">
      <rect x="4.2" y="8.3" width="11.6" height="8" rx="2" />
      <path d="M6.6 8.3V6.1a3.4 3.4 0 0 1 6.8 0v2.2" />
      <path d="M10 11.3v2.1" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg aria-hidden="true" className="layer-toggle-svg" viewBox="0 0 20 20">
      <rect x="4.2" y="8.3" width="11.6" height="8" rx="2" />
      <path d="M6.6 8.3V6.1a3.4 3.4 0 0 1 6.4-1.6" />
      <path d="M10 11.3v2.1" />
    </svg>
  );
}
