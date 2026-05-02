import { useEffect, useMemo, useState } from "react";
import type { LayerCommand, LayerSummary } from "../../app/EditorApp";
import type { LayerFilterSettings } from "../../layers/Layer";
import { defaultLayerFilters } from "../../layers/Layer";
import type { CompiledFontManifest } from "../../rendering/text/CompiledFont";
import { cn } from "../classNames";

type PropertiesPanelProps = {
  isCollapsed: boolean;
  onGroupSelectedLayers: () => void;
  onLayerCommand: (command: LayerCommand) => void;
  onToggleCollapsed: () => void;
  selectedLayer: LayerSummary | null;
  selectedLayers: LayerSummary[];
  selectedTool: string;
};

type NumericField = "height" | "opacity" | "rotation" | "width" | "x" | "y";
type FilterField = keyof LayerFilterSettings;

type TextLayerSummary = LayerSummary & {
  align: "left" | "center" | "right";
  bold: boolean;
  color: [number, number, number, number];
  fontFamily: string;
  fontSize: number;
  italic: boolean;
  text: string;
};

type ShapeLayerSummary = LayerSummary & {
  fillColor: [number, number, number, number];
  shape: "rectangle" | "circle" | "line" | "triangle" | "diamond" | "arrow";
  strokeColor: [number, number, number, number];
  strokeWidth: number;
};

export function PropertiesPanel({
  isCollapsed,
  onGroupSelectedLayers,
  onLayerCommand,
  onToggleCollapsed,
  selectedLayer,
  selectedLayers,
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

  function updateFilter(field: FilterField, value: string, scale = 1) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      return;
    }

    updateSelectedLayer({
      filters: {
        [field]: numberValue / scale
      }
    });
  }

  const hasMultipleSelectedLayers = selectedLayers.length > 1;

  return (
    <section
      className="grid h-full min-h-0 grid-rows-[42px_minmax(0,1fr)] overflow-hidden border-b border-[#2a2d31] last:border-b-0 max-[760px]:border-b-0 max-[760px]:border-r max-[760px]:border-[#2a2d31]"
      aria-label="Properties panel"
    >
      <div className="flex min-h-[42px] items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <PanelToggleButton
            isCollapsed={isCollapsed}
            label={isCollapsed ? "Open Properties panel" : "Collapse Properties panel"}
            onClick={onToggleCollapsed}
          />
          <h2 className="m-0 truncate text-[13px] font-extrabold tracking-normal text-[#f2f4f7] min-[1400px]:text-sm">
            Properties
          </h2>
        </div>
      </div>
      <div className={cn("min-h-0 overflow-auto px-3 pb-3", isCollapsed && "hidden")}>
      <div className="grid gap-3">
        <div className={propertyRowClass}>
          <span className={propertyLabelClass}>Tool</span>
          <strong className={propertyValueClass}>{selectedTool}</strong>
        </div>
        {hasMultipleSelectedLayers ? (
          <div className="grid gap-3 rounded-lg border border-[#3b4652] bg-[#1d232b] p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className={propertySectionTitleClass}>Multiple layers</h3>
              <strong className="rounded border border-[#3b5f58] bg-[#10231f] px-2 py-1 text-[11px] uppercase text-[#79dac7]">
                {selectedLayers.length} selected
              </strong>
            </div>
            <p className="m-0 text-[12px] font-bold text-[#9aa1ab]">
              Create a group to edit these layers together.
            </p>
            <button className={propertyPrimaryButtonClass} onClick={onGroupSelectedLayers} type="button">
              Create group
            </button>
          </div>
        ) : (
          <>
        <div className={propertySectionClass}>
          <h3 className={propertySectionTitleClass}>Layer</h3>
          <label className={propertyRowClass}>
            <span className={propertyLabelClass}>Name</span>
            <input
              className={propertyInputClass}
              disabled={!selectedLayer}
              onChange={(event) => updateSelectedLayer({ name: event.target.value })}
              value={selectedLayer?.name ?? ""}
            />
          </label>
          <div className={propertyRowClass}>
            <span className={propertyLabelClass}>Visible</span>
            <button
              className={propertyToggleClass}
              disabled={!selectedLayer}
              onClick={() => updateSelectedLayer({ visible: !selectedLayer?.isVisible })}
              type="button"
            >
              {selectedLayer?.isVisible ? "Shown" : "Hidden"}
            </button>
          </div>
          <div className={propertyRowClass}>
            <span className={propertyLabelClass}>Locked</span>
            <button
              className={propertyToggleClass}
              disabled={!selectedLayer}
              onClick={() => updateSelectedLayer({ locked: !selectedLayer?.locked })}
              type="button"
            >
              {selectedLayer?.locked ? "Locked" : "Unlocked"}
            </button>
          </div>
        </div>
        <div className={propertySectionClass}>
          <h3 className={propertySectionTitleClass}>Transform</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid min-h-[34px] grid-cols-[28px_minmax(0,1fr)] items-center gap-2.5">
              <span className={propertyLabelClass}>X</span>
              <input
                className={propertyInputClass}
                disabled={!selectedLayer || selectedLayer.locked}
                onChange={(event) => updateNumber("x", event.target.value)}
                type="number"
                value={selectedLayer ? Math.round(selectedLayer.x) : ""}
              />
            </label>
            <label className="grid min-h-[34px] grid-cols-[28px_minmax(0,1fr)] items-center gap-2.5">
              <span className={propertyLabelClass}>Y</span>
              <input
                className={propertyInputClass}
                disabled={!selectedLayer || selectedLayer.locked}
                onChange={(event) => updateNumber("y", event.target.value)}
                type="number"
                value={selectedLayer ? Math.round(selectedLayer.y) : ""}
              />
            </label>
            <label className="grid min-h-[34px] grid-cols-[28px_minmax(0,1fr)] items-center gap-2.5">
              <span className={propertyLabelClass}>W</span>
              <input
                className={propertyInputClass}
                disabled={!selectedLayer || selectedLayer.locked}
                min="1"
                onChange={(event) => updateNumber("width", event.target.value)}
                type="number"
                value={selectedLayer ? Math.round(selectedLayer.width) : ""}
              />
            </label>
            <label className="grid min-h-[34px] grid-cols-[28px_minmax(0,1fr)] items-center gap-2.5">
              <span className={propertyLabelClass}>H</span>
              <input
                className={propertyInputClass}
                disabled={!selectedLayer || selectedLayer.locked}
                min="1"
                onChange={(event) => updateNumber("height", event.target.value)}
                type="number"
                value={selectedLayer ? Math.round(selectedLayer.height) : ""}
              />
            </label>
          </div>
          <label className={propertyRowClass}>
            <span className={propertyLabelClass}>Rotation</span>
            <input
              className={propertyInputClass}
              disabled={!selectedLayer || selectedLayer.locked}
              onChange={(event) => updateNumber("rotation", event.target.value)}
              type="number"
              value={selectedLayer ? Math.round(selectedLayer.rotation) : ""}
            />
          </label>
          <label className={propertyRowClass}>
            <span className={propertyLabelClass}>Opacity</span>
            <input
              className={propertyInputClass}
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
          <div className={propertySectionClass}>
            <h3 className={propertySectionTitleClass}>Text</h3>
            <label className="grid min-h-[34px] grid-cols-[minmax(88px,0.8fr)_minmax(120px,1.2fr)] items-start gap-2.5">
              <span className={propertyLabelClass}>Content</span>
              <textarea
                className="min-h-[88px] w-full resize-y rounded-md border border-[#30353d] bg-[#15171b] p-[7px] text-[#eef1f4] disabled:cursor-not-allowed disabled:text-[#747b85] disabled:opacity-70"
                disabled={selectedLayer.locked}
                onChange={(event) => updateSelectedLayer({ text: event.target.value })}
                rows={4}
                value={selectedLayer.text}
              />
            </label>
            <label className={propertyRowClass}>
              <span className={propertyLabelClass}>Font size</span>
              <input
                className={propertyInputClass}
                disabled={selectedLayer.locked}
                min="1"
                onChange={(event) =>
                  updateSelectedLayer({ fontSize: Number(event.target.value) || 1 })
                }
                type="number"
                value={Math.round(selectedLayer.fontSize)}
              />
            </label>
            <label className={propertyRowClass}>
              <span className={propertyLabelClass}>Font</span>
              <select
                className={propertyInputClass}
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
            <label className={propertyRowClass}>
              <span className={propertyLabelClass}>Color</span>
              <input
                className={propertyInputClass}
                disabled={selectedLayer.locked}
                onChange={(event) => updateSelectedLayer({ color: hexToColor(event.target.value) })}
                type="color"
                value={colorToHex(selectedLayer.color)}
              />
            </label>
            <label className={propertyRowClass}>
              <span className={propertyLabelClass}>Align</span>
              <select
                className={propertyInputClass}
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
            <div className={propertyRowClass}>
              <span className={propertyLabelClass}>Bold</span>
              <button
                className={propertyToggleClass}
                disabled={selectedLayer.locked}
                onClick={() => updateSelectedLayer({ bold: !selectedLayer.bold })}
                type="button"
              >
                {selectedLayer.bold ? "On" : "Off"}
              </button>
            </div>
            <div className={propertyRowClass}>
              <span className={propertyLabelClass}>Italic</span>
              <button
                className={propertyToggleClass}
                disabled={selectedLayer.locked}
                onClick={() => updateSelectedLayer({ italic: !selectedLayer.italic })}
                type="button"
              >
                {selectedLayer.italic ? "On" : "Off"}
              </button>
            </div>
          </div>
        ) : null}
        {isShapeLayerSummary(selectedLayer) ? (
          <div className={propertySectionClass}>
            <h3 className={propertySectionTitleClass}>Shape</h3>
            <label className={propertyRowClass}>
              <span className={propertyLabelClass}>Fill color</span>
              <input
                className={propertyInputClass}
                disabled={selectedLayer.locked}
                onChange={(event) =>
                  updateSelectedLayer({
                    fillColor: hexToColor(event.target.value, selectedLayer.fillColor[3])
                  })
                }
                type="color"
                value={colorToHex(selectedLayer.fillColor)}
              />
            </label>
            <label className={propertyRowClass}>
              <span className={propertyLabelClass}>Stroke color</span>
              <input
                className={propertyInputClass}
                disabled={selectedLayer.locked}
                onChange={(event) =>
                  updateSelectedLayer({
                    strokeColor: hexToColor(event.target.value, selectedLayer.strokeColor[3])
                  })
                }
                type="color"
                value={colorToHex(selectedLayer.strokeColor)}
              />
            </label>
            <label className={propertyRowClass}>
              <span className={propertyLabelClass}>Stroke width</span>
              <input
                className={propertyInputClass}
                disabled={selectedLayer.locked}
                min="0"
                onChange={(event) =>
                  updateSelectedLayer({ strokeWidth: Number(event.target.value) || 0 })
                }
                type="number"
                value={Math.round(selectedLayer.strokeWidth)}
              />
            </label>
          </div>
        ) : null}
        {selectedLayer ? (
          <div className={propertySectionClass}>
            <div className="flex items-center justify-between gap-2">
              <h3 className={propertySectionTitleClass}>Filters</h3>
              <button
                className={propertyToggleClass}
                disabled={selectedLayer.locked}
                onClick={() => updateSelectedLayer({ filters: defaultLayerFilters })}
                type="button"
              >
                Reset
              </button>
            </div>
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Brightness"
              max={100}
              min={-100}
              onChange={(value) => updateFilter("brightness", value, 100)}
              value={Math.round((selectedLayer.filters?.brightness ?? 0) * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Blur"
              max={64}
              min={0}
              onChange={(value) => updateFilter("blur", value)}
              value={Math.round(selectedLayer.filters?.blur ?? 0)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Contrast"
              max={100}
              min={-100}
              onChange={(value) => updateFilter("contrast", value, 100)}
              value={Math.round((selectedLayer.filters?.contrast ?? 0) * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Saturation"
              max={100}
              min={-100}
              onChange={(value) => updateFilter("saturation", value, 100)}
              value={Math.round((selectedLayer.filters?.saturation ?? 0) * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Grayscale"
              max={100}
              min={0}
              onChange={(value) => updateFilter("grayscale", value, 100)}
              value={Math.round((selectedLayer.filters?.grayscale ?? 0) * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Shadow"
              max={100}
              min={-100}
              onChange={(value) => updateFilter("shadow", value, 100)}
              value={Math.round((selectedLayer.filters?.shadow ?? 0) * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Drop shadow"
              max={100}
              min={0}
              onChange={(value) => updateFilter("dropShadowOpacity", value, 100)}
              value={Math.round((selectedLayer.filters?.dropShadowOpacity ?? 0) * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Shadow blur"
              max={80}
              min={0}
              onChange={(value) => updateFilter("dropShadowBlur", value)}
              value={Math.round(selectedLayer.filters?.dropShadowBlur ?? 0)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Shadow X"
              max={240}
              min={-240}
              onChange={(value) => updateFilter("dropShadowOffsetX", value)}
              value={Math.round(
                selectedLayer.filters?.dropShadowOffsetX ??
                  defaultLayerFilters.dropShadowOffsetX
              )}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Shadow Y"
              max={240}
              min={-240}
              onChange={(value) => updateFilter("dropShadowOffsetY", value)}
              value={Math.round(
                selectedLayer.filters?.dropShadowOffsetY ??
                  defaultLayerFilters.dropShadowOffsetY
              )}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Hue"
              max={180}
              min={-180}
              onChange={(value) => updateFilter("hue", value)}
              value={Math.round(selectedLayer.filters?.hue ?? 0)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Sepia"
              max={100}
              min={0}
              onChange={(value) => updateFilter("sepia", value, 100)}
              value={Math.round((selectedLayer.filters?.sepia ?? 0) * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Invert"
              max={100}
              min={0}
              onChange={(value) => updateFilter("invert", value, 100)}
              value={Math.round((selectedLayer.filters?.invert ?? 0) * 100)}
            />
          </div>
        ) : null}
        <div className={propertySectionClass}>
          <h3 className={propertySectionTitleClass}>Mask</h3>
          <div className={propertyRowClass}>
            <span className={propertyLabelClass}>Status</span>
            <strong className={propertyValueClass}>
              {selectedLayer?.hasMask
                ? selectedLayer.maskEnabled
                  ? "Enabled"
                  : "Disabled"
                : "None"}
            </strong>
          </div>
        </div>
          </>
        )}
      </div>
      </div>
    </section>
  );
}

function isTextLayerSummary(layer: LayerSummary | null): layer is TextLayerSummary {
  return Boolean(layer && layer.type === "text" && "text" in layer);
}

function isShapeLayerSummary(layer: LayerSummary | null): layer is ShapeLayerSummary {
  return Boolean(layer && layer.type === "shape" && "shape" in layer);
}

function FilterSlider({
  disabled,
  label,
  max,
  min,
  onChange,
  value
}: {
  disabled: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  value: number;
}) {
  return (
    <label className="grid min-h-[34px] grid-cols-[minmax(88px,0.75fr)_minmax(120px,1.25fr)] items-center gap-2.5">
      <span className={propertyLabelClass}>{label}</span>
      <span className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-2">
        <input
          className="min-w-0 accent-[#4aa391]"
          disabled={disabled}
          max={max}
          min={min}
          onChange={(event) => onChange(event.target.value)}
          type="range"
          value={value}
        />
        <input
          className={propertyInputClass}
          disabled={disabled}
          max={max}
          min={min}
          onChange={(event) => onChange(event.target.value)}
          type="number"
          value={value}
        />
      </span>
    </label>
  );
}

function PanelToggleButton({
  isCollapsed,
  label,
  onClick
}: {
  isCollapsed: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-expanded={!isCollapsed}
      className="grid h-6 w-6 flex-none place-items-center rounded-md border border-[#333941] bg-[#202329] text-sm font-bold leading-none text-[#c9cdd2] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "translate-y-[-1px] transition-transform duration-150",
          isCollapsed && "-rotate-90"
        )}
        aria-hidden="true"
      >
        v
      </span>
    </button>
  );
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

function hexToColor(hex: string, alpha = 1): [number, number, number, number] {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return [
    Number.isFinite(red) ? red / 255 : 0,
    Number.isFinite(green) ? green / 255 : 0,
    Number.isFinite(blue) ? blue / 255 : 0,
    alpha
  ];
}

const propertySectionClass =
  "grid gap-2 border-b border-[#2d3137] pb-3 last:border-b-0 last:pb-0";

const propertySectionTitleClass =
  "m-0 mb-0.5 text-xs font-extrabold uppercase tracking-normal text-[#cfd4da]";

const propertyRowClass =
  "grid min-h-[34px] grid-cols-[minmax(88px,0.8fr)_minmax(120px,1.2fr)] items-center gap-2.5";

const propertyLabelClass = "text-xs text-[#9aa1ab] min-[1400px]:text-[13px]";

const propertyValueClass =
  "m-0 text-right text-[13px] font-bold text-[#f2f4f7] min-[1400px]:text-sm";

const propertyInputClass =
  "w-full min-w-0 rounded-md border border-[#30353d] bg-[#15171b] px-[7px] py-[5px] text-right text-[13px] text-[#eef1f4] disabled:cursor-not-allowed disabled:text-[#747b85] disabled:opacity-70 min-[1400px]:text-sm";

const propertyToggleClass =
  "justify-self-end rounded-md border border-[#333941] bg-[#171a1f] px-[9px] py-1 text-[11px] font-bold text-[#dce1e6] hover:border-[#4aa391] hover:bg-[#203731] disabled:cursor-not-allowed disabled:text-[#747b85] disabled:opacity-70 disabled:hover:border-[#333941] disabled:hover:bg-[#171a1f]";

const propertyPrimaryButtonClass =
  "rounded-md border border-[#4aa391] bg-[#203731] px-3 py-2 text-[12px] font-extrabold text-[#eef1f4] hover:bg-[#25443c] focus-visible:bg-[#25443c]";
