import { useEffect, useMemo, useState } from "react";
import type { LayerCommand, LayerSummary } from "../../app/EditorApp";
import type { CompiledFontManifest } from "../../rendering/text/CompiledFont";

type PropertiesPanelProps = {
  onLayerCommand: (command: LayerCommand) => void;
  selectedLayer: LayerSummary | null;
  selectedTool: string;
};

type NumericField = "height" | "opacity" | "rotation" | "width" | "x" | "y";

type TextLayerSummary = LayerSummary & {
  align: "left" | "center" | "right";
  bold: boolean;
  color: [number, number, number, number];
  fontFamily: string;
  fontSize: number;
  italic: boolean;
  text: string;
};

export function PropertiesPanel({
  onLayerCommand,
  selectedLayer,
  selectedTool
}: PropertiesPanelProps) {
  const [compiledFontFamilies, setCompiledFontFamilies] = useState<string[]>([]);
  const fontFamilies = useMemo(
    () => getFontFamilyOptions(compiledFontFamilies, selectedLayer),
    [compiledFontFamilies, selectedLayer]
  );

  useEffect(() => {
    let didCancel = false;

    fetch("/fonts/font-manifest.json")
      .then((response) => (response.ok ? response.json() : { fonts: [] }))
      .then((manifest: CompiledFontManifest) => {
        if (!didCancel) {
          setCompiledFontFamilies(getManifestFontFamilies(manifest));
        }
      })
      .catch(() => {
        if (!didCancel) {
          setCompiledFontFamilies([]);
        }
      });

    return () => {
      didCancel = true;
    };
  }, []);

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
        <div className="property-section">
          <h3>Layer</h3>
          <label>
            <span>Name</span>
            <input
              disabled={!selectedLayer}
              onChange={(event) => updateSelectedLayer({ name: event.target.value })}
              value={selectedLayer?.name ?? ""}
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
        </div>
        <div className="property-section">
          <h3>Transform</h3>
          <div className="property-two-column">
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
              <span>W</span>
              <input
                disabled={!selectedLayer || selectedLayer.locked}
                min="1"
                onChange={(event) => updateNumber("width", event.target.value)}
                type="number"
                value={selectedLayer ? Math.round(selectedLayer.width) : ""}
              />
            </label>
            <label>
              <span>H</span>
              <input
                disabled={!selectedLayer || selectedLayer.locked}
                min="1"
                onChange={(event) => updateNumber("height", event.target.value)}
                type="number"
                value={selectedLayer ? Math.round(selectedLayer.height) : ""}
              />
            </label>
          </div>
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
        </div>
        {isTextLayerSummary(selectedLayer) ? (
          <div className="property-section property-section-text">
            <h3>Text</h3>
            <label>
              <span>Content</span>
              <textarea
                disabled={selectedLayer.locked}
                onChange={(event) => updateSelectedLayer({ text: event.target.value })}
                rows={4}
                value={selectedLayer.text}
              />
            </label>
            <label>
              <span>Font size</span>
              <input
                disabled={selectedLayer.locked}
                min="1"
                onChange={(event) =>
                  updateSelectedLayer({ fontSize: Number(event.target.value) || 1 })
                }
                type="number"
                value={Math.round(selectedLayer.fontSize)}
              />
            </label>
            <label>
              <span>Font</span>
              <select
                disabled={selectedLayer.locked}
                onChange={(event) => updateSelectedLayer({ fontFamily: event.target.value })}
                value={selectedLayer.fontFamily}
              >
                {fontFamilies.map((fontFamily) => (
                  <option key={fontFamily} value={fontFamily}>
                    {fontFamily}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Color</span>
              <input
                disabled={selectedLayer.locked}
                onChange={(event) => updateSelectedLayer({ color: hexToColor(event.target.value) })}
                type="color"
                value={colorToHex(selectedLayer.color)}
              />
            </label>
            <label>
              <span>Align</span>
              <select
                disabled={selectedLayer.locked}
                onChange={(event) =>
                  updateSelectedLayer({
                    align:
                      event.target.value === "center"
                        ? "center"
                        : event.target.value === "right"
                          ? "right"
                          : "left"
                  })
                }
                value={selectedLayer.align}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <div className="property-toggle-row">
              <span>Bold</span>
              <button
                disabled={selectedLayer.locked}
                onClick={() => updateSelectedLayer({ bold: !selectedLayer.bold })}
                type="button"
              >
                {selectedLayer.bold ? "On" : "Off"}
              </button>
            </div>
            <div className="property-toggle-row">
              <span>Italic</span>
              <button
                disabled={selectedLayer.locked}
                onClick={() => updateSelectedLayer({ italic: !selectedLayer.italic })}
                type="button"
              >
                {selectedLayer.italic ? "On" : "Off"}
              </button>
            </div>
          </div>
        ) : null}
        <div className="property-section">
          <h3>Mask</h3>
          <div>
            <span>Status</span>
            <strong>
              {selectedLayer?.hasMask
                ? selectedLayer.maskEnabled
                  ? "Enabled"
                  : "Disabled"
                : "None"}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function isTextLayerSummary(layer: LayerSummary | null): layer is TextLayerSummary {
  return Boolean(layer && layer.type === "text" && "text" in layer);
}

function getManifestFontFamilies(manifest: CompiledFontManifest) {
  return [
    ...new Set(
      (Array.isArray(manifest.fonts) ? manifest.fonts : [])
        .map((font) => font.family.trim())
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));
}

function getFontFamilyOptions(
  compiledFontFamilies: string[],
  selectedLayer: LayerSummary | null
) {
  const fontFamilies = ["Webster Bitmap", ...compiledFontFamilies];

  if (
    isTextLayerSummary(selectedLayer) &&
    selectedLayer.fontFamily &&
    !isLegacyBrowserFont(selectedLayer.fontFamily)
  ) {
    fontFamilies.push(selectedLayer.fontFamily);
  }

  return [...new Set(fontFamilies)];
}

function isLegacyBrowserFont(fontFamily: string) {
  return ["arial", "courier new", "georgia"].includes(fontFamily.trim().toLowerCase());
}

function colorToHex(color: [number, number, number, number]) {
  return `#${color
    .slice(0, 3)
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToColor(hex: string): [number, number, number, number] {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return [
    Number.isFinite(red) ? red / 255 : 0,
    Number.isFinite(green) ? green / 255 : 0,
    Number.isFinite(blue) ? blue / 255 : 0,
    1
  ];
}
