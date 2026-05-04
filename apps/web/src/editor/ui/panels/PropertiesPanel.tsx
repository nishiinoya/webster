import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerAssetCommand, LayerCommand, LayerSummary } from "../../app/EditorApp";
import type {
  LayerFilterSettings,
  LayerTextureKind,
  LayerTextureSettings,
  Object3DKind
} from "../../layers/Layer";
import type { ImageLayerGeometry } from "../../layers/Layer";
import { defaultLayerFilters } from "../../layers/Layer";
import { createDefaultImageLayerGeometry } from "../../layers/ImageLayer";
import type { CompiledFontManifest } from "../../rendering/text/CompiledFont";
import { cn } from "../classNames";

type PropertiesPanelProps = {
  isCollapsed: boolean;
  onChangeObject3DModel: () => void;
  onGroupSelectedLayers: () => void;
  onLayerAssetCommand: (command: LayerAssetCommand) => void;
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
  customPath: Array<{ x: number; y: number }>;
  fillColor: [number, number, number, number];
  shape: "rectangle" | "circle" | "line" | "triangle" | "diamond" | "arrow" | "custom";
  strokeColor: [number, number, number, number];
  strokeWidth: number;
  texture: LayerTextureSettings;
  textureImage: ImportedTextureSummary | null;
};

type Object3DLayerSummary = LayerSummary & {
  ambient: number;
  lightIntensity: number;
  lightX: number;
  lightY: number;
  lightZ: number;
  materialColor: [number, number, number, number];
  materialTexture: LayerTextureSettings;
  materialTextureImage: ImportedTextureSummary | null;
  modelFormat: string | null;
  modelName: string | null;
  modelStats: {
    assignedTextureCount: number;
    materialCount: number;
    partCount: number;
    textureCount: number;
    triangleCount: number;
    vertexCount: number;
  } | null;
  modelSummary: {
    assignedTextureMaps: string[];
    guessedTextureMaps: string[];
    loadedTextureNames: string[];
    materialNames: string[];
    unassignedTextureNames: string[];
  } | null;
  modelWarnings: string[];
  objectKind: Object3DKind;
  objectZoom: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  shadowOpacity: number;
  shadowSoftness: number;
};

type ImportedTextureSummary = {
  height: number;
  name: string;
  width: number;
};

type ImageLayerSummary = LayerSummary & {
  hasCustomImageGeometry: boolean;
  imageGeometry: ImageLayerGeometry;
};
type ImageGeometryCornerId = keyof ImageLayerGeometry["corners"];

export function PropertiesPanel({
  isCollapsed,
  onChangeObject3DModel,
  onGroupSelectedLayers,
  onLayerAssetCommand,
  onLayerCommand,
  onToggleCollapsed,
  selectedLayer,
  selectedLayers,
  selectedTool
}: PropertiesPanelProps) {
  const objectMaterialTextureInputRef = useRef<HTMLInputElement | null>(null);
  const objectModelInputRef = useRef<HTMLInputElement | null>(null);
  const shapeTextureInputRef = useRef<HTMLInputElement | null>(null);
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

  function updateImageGeometry(geometry: ImageLayerGeometry) {
    updateSelectedLayer({ imageGeometry: geometry });
  }

  function updateImageCorner(
    cornerId: ImageGeometryCornerId,
    axis: "x" | "y",
    value: string
  ) {
    if (!isImageLayerSummary(selectedLayer)) {
      return;
    }

    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      return;
    }

    updateImageGeometry({
      ...selectedLayer.imageGeometry,
      corners: {
        ...selectedLayer.imageGeometry.corners,
        [cornerId]: {
          ...selectedLayer.imageGeometry.corners[cornerId],
          [axis]: numberValue / 100
        }
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
            <TextureControls
              disabled={selectedLayer.locked}
              onChange={(texture) => updateSelectedLayer({ texture })}
              texture={selectedLayer.texture}
            />
            <div className={propertyRowClass}>
              <span className={propertyLabelClass}>Image texture</span>
              <span className="flex min-w-0 justify-end gap-2">
                <button
                  className={propertyToggleClass}
                  disabled={selectedLayer.locked}
                  onClick={() => shapeTextureInputRef.current?.click()}
                  type="button"
                >
                  Import...
                </button>
                <button
                  className={propertyToggleClass}
                  disabled={selectedLayer.locked || !selectedLayer.textureImage}
                  onClick={() =>
                    onLayerAssetCommand({
                      layerId: selectedLayer.id,
                      type: "clear-shape-texture"
                    })
                  }
                  type="button"
                >
                  Remove
                </button>
              </span>
            </div>
            {selectedLayer.textureImage ? (
              <div className={propertyRowClass}>
                <span className={propertyLabelClass}>Imported</span>
                <strong className={propertyValueClass}>
                  {formatImportedAsset(selectedLayer.textureImage)}
                </strong>
              </div>
            ) : null}
            <input
              ref={shapeTextureInputRef}
              accept="image/*"
              className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  onLayerAssetCommand({
                    file,
                    layerId: selectedLayer.id,
                    type: "import-shape-texture"
                  });
                  event.target.value = "";
                }
              }}
              type="file"
            />
          </div>
        ) : null}
        {isObject3DLayerSummary(selectedLayer) ? (
          <div className={propertySectionClass}>
            <h3 className={propertySectionTitleClass}>3D object</h3>
            <div className={propertyRowClass}>
              <span className={propertyLabelClass}>Model</span>
              <span className="flex min-w-0 justify-end gap-2">
                <button
                  className={propertyToggleClass}
                  disabled={selectedLayer.locked}
                  onClick={onChangeObject3DModel}
                  type="button"
                >
                  Change model...
                </button>
              </span>
            </div>
            <ReadOnlyRow label="Imported" value={selectedLayer.modelName ?? "Legacy fallback"} />
            <ReadOnlyRow
              label="Format"
              value={selectedLayer.modelFormat?.toUpperCase() ?? selectedLayer.objectKind}
            />
            {selectedLayer.modelStats ? (
              <>
                <ReadOnlyRow
                  label="Mesh"
                  value={`${selectedLayer.modelStats.partCount} parts, ${selectedLayer.modelStats.vertexCount} vertices`}
                />
                <ReadOnlyRow
                  label="Materials"
                  value={`${selectedLayer.modelStats.materialCount} materials, ${selectedLayer.modelStats.textureCount} textures`}
                />
              </>
            ) : null}
            {selectedLayer.modelSummary ? (
              <div className="grid gap-2 rounded-md border border-[#30353d] bg-[#111317] p-2">
                <ReadOnlyChipList
                  emptyLabel="No imported material names"
                  names={selectedLayer.modelSummary.materialNames}
                  title="Materials"
                />
                <ReadOnlyChipList
                  emptyLabel="No imported texture files"
                  names={selectedLayer.modelSummary.loadedTextureNames}
                  title="Textures"
                />
                <ReadOnlyChipList
                  emptyLabel="No assigned texture maps"
                  names={selectedLayer.modelSummary.assignedTextureMaps}
                  title="Assigned maps"
                />
                {selectedLayer.modelSummary.unassignedTextureNames.length > 0 ? (
                  <ReadOnlyChipList
                    emptyLabel=""
                    names={selectedLayer.modelSummary.unassignedTextureNames}
                    title="Unassigned"
                  />
                ) : null}
                {selectedLayer.modelWarnings.length > 0 ? (
                  <ReadOnlyChipList
                    emptyLabel=""
                    names={selectedLayer.modelWarnings}
                    title="Warnings"
                  />
                ) : null}
              </div>
            ) : null}
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Object zoom"
              max={400}
              min={20}
              onChange={(value) => updateSelectedLayer({ objectZoom: Number(value) / 100 })}
              value={Math.round(selectedLayer.objectZoom * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Rotate X"
              max={180}
              min={-180}
              onChange={(value) => updateSelectedLayer({ rotationX: Number(value) || 0 })}
              value={Math.round(selectedLayer.rotationX)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Rotate Y"
              max={180}
              min={-180}
              onChange={(value) => updateSelectedLayer({ rotationY: Number(value) || 0 })}
              value={Math.round(selectedLayer.rotationY)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Rotate Z"
              max={180}
              min={-180}
              onChange={(value) => updateSelectedLayer({ rotationZ: Number(value) || 0 })}
              value={Math.round(selectedLayer.rotationZ)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Light X"
              max={6}
              min={-6}
              onChange={(value) => updateSelectedLayer({ lightX: Number(value) || 0 })}
              step={0.1}
              value={roundTenth(selectedLayer.lightX)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Light Y"
              max={6}
              min={-6}
              onChange={(value) => updateSelectedLayer({ lightY: Number(value) || 0 })}
              step={0.1}
              value={roundTenth(selectedLayer.lightY)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Light Z"
              max={10}
              min={1}
              onChange={(value) => updateSelectedLayer({ lightZ: Number(value) || 1 })}
              step={0.1}
              value={roundTenth(selectedLayer.lightZ)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Intensity"
              max={200}
              min={0}
              onChange={(value) => updateSelectedLayer({ lightIntensity: Number(value) / 100 })}
              value={Math.round(selectedLayer.lightIntensity * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Ambient"
              max={100}
              min={0}
              onChange={(value) => updateSelectedLayer({ ambient: Number(value) / 100 })}
              value={Math.round(selectedLayer.ambient * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Layer shadow"
              max={100}
              min={0}
              onChange={(value) => updateSelectedLayer({ shadowOpacity: Number(value) / 100 })}
              value={Math.round(selectedLayer.shadowOpacity * 100)}
            />
            <FilterSlider
              disabled={selectedLayer.locked}
              label="Shadow soft"
              max={64}
              min={0}
              onChange={(value) => updateSelectedLayer({ shadowSoftness: Number(value) || 0 })}
              value={Math.round(selectedLayer.shadowSoftness)}
            />
          </div>
        ) : null}
        {isImageLayerSummary(selectedLayer) ? (
          <div className={propertySectionClass}>
            <h3 className={propertySectionTitleClass}>Image geometry</h3>
            <div className={propertyRowClass}>
              <span className={propertyLabelClass}>State</span>
              <strong className={propertyValueClass}>
                {selectedLayer.hasCustomImageGeometry ? "Custom" : "Default"}
              </strong>
            </div>
            <div className={propertyRowClass}>
              <span className={propertyLabelClass}>Crop</span>
              <strong className={propertyValueClass}>
                {formatCropValue(selectedLayer.imageGeometry.crop)}
              </strong>
            </div>
            {selectedTool === "Transform" ? (
              <div className="grid gap-2">
                <h4 className="m-0 text-[11px] font-extrabold uppercase text-[#9aa1ab]">
                  Corner points
                </h4>
                {getImageCornerRows().map(([cornerId, label]) => {
                  const corner = selectedLayer.imageGeometry.corners[cornerId];

                  return (
                    <div
                      className="grid min-h-[34px] grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
                      key={cornerId}
                    >
                      <span className={propertyLabelClass}>{label}</span>
                      <input
                        className={propertyInputClass}
                        disabled={selectedLayer.locked}
                        onChange={(event) =>
                          updateImageCorner(cornerId, "x", event.target.value)
                        }
                        type="number"
                        value={Math.round(corner.x * 100)}
                      />
                      <input
                        className={propertyInputClass}
                        disabled={selectedLayer.locked}
                        onChange={(event) =>
                          updateImageCorner(cornerId, "y", event.target.value)
                        }
                        type="number"
                        value={Math.round(corner.y * 100)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              <button
                className={propertyToggleClass}
                disabled={selectedLayer.locked}
                onClick={() => {
                  const defaults = createDefaultImageLayerGeometry();

                  updateImageGeometry({
                    ...selectedLayer.imageGeometry,
                    crop: defaults.crop
                  });
                }}
                type="button"
              >
                Reset crop
              </button>
              <button
                className={propertyToggleClass}
                disabled={selectedLayer.locked}
                onClick={() => {
                  const defaults = createDefaultImageLayerGeometry();

                  updateImageGeometry({
                    ...selectedLayer.imageGeometry,
                    corners: defaults.corners
                  });
                }}
                type="button"
              >
                Reset warp
              </button>
              <button
                className={propertyToggleClass}
                disabled={selectedLayer.locked}
                onClick={() => updateImageGeometry(createDefaultImageLayerGeometry())}
                type="button"
              >
                Reset all
              </button>
            </div>
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

function isObject3DLayerSummary(layer: LayerSummary | null): layer is Object3DLayerSummary {
  return Boolean(layer && layer.type === "object3d" && "objectKind" in layer);
}

function isImageLayerSummary(layer: LayerSummary | null): layer is ImageLayerSummary {
  return Boolean(layer && layer.type === "image" && "imageGeometry" in layer);
}

function formatCropValue(crop: ImageLayerGeometry["crop"]) {
  const width = Math.round((crop.right - crop.left) * 100);
  const height = Math.round((crop.top - crop.bottom) * 100);

  return `${width}% x ${height}%`;
}

function getImageCornerRows(): Array<[ImageGeometryCornerId, string]> {
  return [
    ["topLeft", "TL"],
    ["topRight", "TR"],
    ["bottomRight", "BR"],
    ["bottomLeft", "BL"]
  ];
}

function FilterSlider({
  disabled,
  label,
  max,
  min,
  onChange,
  step,
  value
}: {
  disabled: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  step?: number;
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
          step={step}
          type="range"
          value={value}
        />
        <input
          className={propertyInputClass}
          disabled={disabled}
          max={max}
          min={min}
          onChange={(event) => onChange(event.target.value)}
          step={step}
          type="number"
          value={value}
        />
      </span>
    </label>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={propertyRowClass}>
      <span className={propertyLabelClass}>{label}</span>
      <strong className={propertyValueClass}>{value}</strong>
    </div>
  );
}

function ReadOnlyChipList({
  emptyLabel,
  names,
  title
}: {
  emptyLabel: string;
  names: string[];
  title: string;
}) {
  return (
    <div className="grid gap-1">
      <strong className="text-[11px] font-extrabold uppercase text-[#8b929b]">
        {title}
      </strong>
      {names.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {names.slice(0, 14).map((name, index) => (
            <span
              className="max-w-[260px] truncate rounded-md border border-[#30353d] bg-[#171a1f] px-2 py-1 text-[11px] font-bold text-[#c9cdd2]"
              key={`${title}-${name}-${index}`}
              title={name}
            >
              {name}
            </span>
          ))}
          {names.length > 14 ? (
            <span className="rounded-md border border-[#30353d] bg-[#171a1f] px-2 py-1 text-[11px] font-bold text-[#8b929b]">
              +{names.length - 14}
            </span>
          ) : null}
        </div>
      ) : (
        <span className="text-[12px] font-bold text-[#6f7680]">{emptyLabel}</span>
      )}
    </div>
  );
}

function TextureControls({
  disabled,
  onChange,
  texture
}: {
  disabled: boolean;
  onChange: (texture: Partial<LayerTextureSettings>) => void;
  texture: LayerTextureSettings;
}) {
  return (
    <>
      <label className={propertyRowClass}>
        <span className={propertyLabelClass}>Texture</span>
        <select
          className={propertyInputClass}
          disabled={disabled}
          onChange={(event) => {
            const kind = toLayerTextureKind(event.target.value);

            onChange({
              blend: kind === "none" ? 0 : Math.max(texture.blend, 0.35),
              kind
            });
          }}
          value={texture.kind}
        >
          <option value="none">None</option>
          <option value="checkerboard">Checkerboard</option>
          <option value="stripes">Stripes</option>
          <option value="dots">Dots</option>
          <option value="grain">Grain</option>
          <option value="image">Image</option>
        </select>
      </label>
      {texture.kind !== "none" ? (
        <>
          <label className={propertyRowClass}>
            <span className={propertyLabelClass}>Texture color</span>
            <input
              className={propertyInputClass}
              disabled={disabled}
              onChange={(event) =>
                onChange({ color: hexToColor(event.target.value, texture.color[3]) })
              }
              type="color"
              value={colorToHex(texture.color)}
            />
          </label>
          <FilterSlider
            disabled={disabled}
            label="Texture scale"
            max={96}
            min={2}
            onChange={(value) => onChange({ scale: Number(value) || 2 })}
            value={Math.round(texture.scale)}
          />
          <FilterSlider
            disabled={disabled}
            label="Texture mix"
            max={100}
            min={0}
            onChange={(value) => onChange({ blend: Number(value) / 100 })}
            value={Math.round(texture.blend * 100)}
          />
          <FilterSlider
            disabled={disabled}
            label="Texture edge"
            max={100}
            min={0}
            onChange={(value) => onChange({ contrast: Number(value) / 100 })}
            value={Math.round(texture.contrast * 100)}
          />
        </>
      ) : null}
    </>
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

function toObject3DKind(value: string): Object3DKind {
  if (value === "sphere" || value === "pyramid" || value === "imported") {
    return value;
  }

  return "cube";
}

function toLayerTextureKind(value: string): LayerTextureKind {
  if (
    value === "checkerboard" ||
    value === "stripes" ||
    value === "dots" ||
    value === "grain" ||
    value === "image"
  ) {
    return value;
  }

  return "none";
}

function roundTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function formatImportedAsset(asset: ImportedTextureSummary) {
  return `${asset.name} (${asset.width} x ${asset.height})`;
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
