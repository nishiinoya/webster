import { useEffect, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent
} from "react";
import type { LayerCommand, LayerSummary } from "../../app/EditorApp";
import { cn } from "../classNames";

type LayersPanelProps = {
  canGroupSelectedLayers: boolean;
  isCollapsed: boolean;
  layers: LayerSummary[];
  onGroupSelectedLayers: () => void;
  onLayerCommand: (command: LayerCommand) => void;
  onSelectLayers: (layerIds: string[]) => void;
  onToggleCollapsed: () => void;
};

export function LayersPanel({
  canGroupSelectedLayers,
  isCollapsed,
  layers,
  onGroupSelectedLayers,
  onLayerCommand,
  onSelectLayers,
  onToggleCollapsed
}: LayersPanelProps) {
  const [openMenu, setOpenMenu] = useState<{
    layerId: string;
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    function closeMenu() {
      setOpenMenu(null);
    }

    function closeMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    }

    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeMenuOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [openMenu]);

  function stopPanelControl(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function updateLayer(layerId: string, updates: Extract<LayerCommand, { type: "update" }>["updates"]) {
    onLayerCommand({ type: "update", layerId, updates });
  }

  function runLayerMenuCommand(command: LayerCommand) {
    onLayerCommand(command);
    setOpenMenu(null);
  }

  function selectLayerFromPanel(
    event: MouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
    layerId: string
  ) {
    const selectedLayerIds = layers.filter((layer) => layer.isSelected).map((layer) => layer.id);

    if (event.shiftKey && selectedLayerIds.length > 0) {
      const anchorLayerId =
        layers.find((layer) => layer.isPrimarySelected)?.id ?? selectedLayerIds.at(-1) ?? layerId;
      const anchorIndex = layers.findIndex((layer) => layer.id === anchorLayerId);
      const layerIndex = layers.findIndex((layer) => layer.id === layerId);

      if (anchorIndex < 0 || layerIndex < 0) {
        onSelectLayers([layerId]);
        return;
      }

      const startIndex = Math.min(anchorIndex, layerIndex);
      const endIndex = Math.max(anchorIndex, layerIndex);

      onSelectLayers(layers.slice(startIndex, endIndex + 1).map((layer) => layer.id));
      return;
    }

    if ((event.ctrlKey || event.metaKey) && selectedLayerIds.length > 0) {
      const nextLayerIds = selectedLayerIds.includes(layerId)
        ? selectedLayerIds.filter((selectedLayerId) => selectedLayerId !== layerId)
        : [...selectedLayerIds, layerId];

      onSelectLayers(nextLayerIds.length > 0 ? nextLayerIds : [layerId]);
      return;
    }

    onSelectLayers([layerId]);
  }

  function toggleLayerMenu(event: MouseEvent<HTMLButtonElement>, layerId: string) {
    stopPanelControl(event);

    const bounds = event.currentTarget.getBoundingClientRect();
    const menuWidth = 190;

    setOpenMenu((currentMenu) =>
      currentMenu?.layerId === layerId
        ? null
        : {
            layerId,
            left: Math.min(window.innerWidth - menuWidth - 8, Math.max(8, bounds.right - menuWidth)),
            top: Math.min(window.innerHeight - 340, bounds.bottom + 6)
          }
    );
  }

  return (
    <section
      className="grid h-full min-h-0 grid-rows-[42px_minmax(0,1fr)] overflow-hidden border-b border-[#2a2d31] last:border-b-0 max-[760px]:border-b-0 max-[760px]:border-r max-[760px]:border-[#2a2d31]"
      aria-label="Layers panel"
    >
      <div className="flex min-h-[42px] items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <PanelToggleButton
            isCollapsed={isCollapsed}
            label={isCollapsed ? "Open Layers panel" : "Collapse Layers panel"}
            onClick={onToggleCollapsed}
          />
          <h2 className="m-0 truncate text-[13px] font-extrabold tracking-normal text-[#f2f4f7] min-[1400px]:text-sm">
            Layers
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-[#333941] bg-[#202329] px-2 py-1 text-[11px] font-bold text-[#dce1e6] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731] disabled:cursor-not-allowed disabled:text-[#747b85] disabled:opacity-70 disabled:hover:border-[#333941] disabled:hover:bg-[#202329]"
            disabled={!canGroupSelectedLayers}
            onClick={onGroupSelectedLayers}
            type="button"
          >
            Group
          </button>
          <button
            className="rounded-md border border-[#333941] bg-[#202329] px-2 py-1 text-[11px] font-bold text-[#dce1e6] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
            onClick={() => onLayerCommand({ type: "add-adjustment" })}
            type="button"
          >
            + Adjust
          </button>
          <span className="text-xs text-[#9aa1ab] min-[1400px]:text-[13px]">{layers.length}</span>
        </div>
      </div>
      <div className={cn("min-h-0 overflow-auto px-3 pb-3", isCollapsed && "hidden")}>
      <div className="grid gap-2">
        {layers.map((layer) => {
          const indent = Math.min(layer.depth, 10) * 18;

          return (
        <div
          aria-selected={layer.isSelected}
          className={cn(
            "relative grid min-h-[82px] w-full grid-cols-[28px_38px_minmax(0,1fr)_30px] items-start gap-[9px] rounded-lg border border-[#292e35] bg-[#171a1f] p-[9px] text-left hover:border-[#4c535c] hover:bg-[#252930] min-[1400px]:min-h-[88px] min-[1400px]:grid-cols-[30px_42px_minmax(0,1fr)_32px]",
            layer.depth > 0 && "border-[#242a31]",
            layer.type === "group" && "min-h-[74px] border-[#3b4652] bg-[#1d232b]",
            layer.isSelected && "border-[#4aa391] bg-[#172722] shadow-[inset_3px_0_0_#4aa391]"
          )}
            key={layer.id}
            onClick={(event) => selectLayerFromPanel(event, layer.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectLayerFromPanel(event, layer.id);
              }
            }}
          role="button"
          style={{
            marginLeft: indent,
            width: indent > 0 ? `calc(100% - ${indent}px)` : undefined
          }}
          tabIndex={0}
        >
            {layer.depth > 0 ? <LayerTreeGuides depth={layer.depth} /> : null}
            <div className="grid gap-1.5" onClick={stopPanelControl}>
              <button
                aria-label={layer.isVisible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                aria-pressed={layer.isVisible}
                className={layerToggleClass(layer.isVisible)}
                onClick={() => updateLayer(layer.id, { visible: !layer.isVisible })}
                type="button"
              >
                {layer.isVisible ? <EyeIcon /> : <EyeOffIcon />}
              </button>
              <button
                aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                aria-pressed={layer.locked}
                className={layerToggleClass(layer.locked)}
                onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                type="button"
              >
                {layer.locked ? <LockIcon /> : <UnlockIcon />}
              </button>
            </div>
            <span
              className={cn(
                "h-[38px] w-[38px] rounded-md border border-[#3a3f47] bg-[linear-gradient(45deg,#2c3036_25%,#41464f_25%,#41464f_50%,#2c3036_50%,#2c3036_75%,#41464f_75%)] bg-[length:10px_10px] min-[1400px]:h-[42px] min-[1400px]:w-[42px]",
                layer.type === "image" &&
                  "bg-[#252930] bg-[linear-gradient(135deg,rgba(74,163,145,0.65),rgba(118,137,255,0.55))]",
                layer.type === "adjustment" &&
                  "bg-[#252930] bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.8),rgba(74,163,145,0.45)_42%,rgba(32,35,41,0.95)_70%)]",
                layer.type === "shape" && "bg-[#2f7d6f]",
                layer.type === "group" &&
                  "border-[#5f7689] bg-[#252930] bg-[linear-gradient(180deg,#607489_0_38%,#222832_38%_100%)] shadow-[inset_0_0_0_1px_rgba(121,218,199,0.18)]"
              )}
              aria-hidden="true"
            />
            <div className="grid min-w-0 gap-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                {layer.type === "group" ? (
                  <button
                    aria-label={layer.collapsed ? `Expand ${layer.name}` : `Collapse ${layer.name}`}
                    aria-expanded={!layer.collapsed}
                    className="grid h-6 w-6 flex-none place-items-center rounded-md border border-[#30353d] bg-[#111317] text-xs font-black text-[#c9cdd2] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
                    onClick={(event) => {
                      stopPanelControl(event);
                      updateLayer(layer.id, { collapsed: !layer.collapsed });
                    }}
                    type="button"
                  >
                    <span
                      className={cn(
                        "translate-y-[-1px] transition-transform duration-150",
                        layer.collapsed && "-rotate-90"
                      )}
                      aria-hidden="true"
                    >
                      v
                    </span>
                  </button>
                ) : null}
                <input
                  aria-label={`Rename ${layer.name}`}
                  className="w-full min-w-0 truncate rounded-md border border-transparent bg-transparent py-0.5 text-[13px] font-extrabold text-[#eef1f4] focus:border-[#4aa391] focus:bg-[#101113] focus:px-[7px] focus:py-[5px] focus:outline-0 min-[1400px]:text-sm"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateLayer(layer.id, { name: event.target.value })
                  }
                  onClick={stopPanelControl}
                  value={layer.name}
                />
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold capitalize text-[#8f98a3] min-[1400px]:text-xs">
                <span>
                  {layer.type === "group" ? `${layer.childCount} items` : layer.type}
                </span>
                {layer.type === "group" ? (
                  <span className="rounded border border-[#3b5f58] bg-[#10231f] px-1.5 py-[2px] text-[10px] font-extrabold uppercase text-[#79dac7]">
                    Group
                  </span>
                ) : null}
                {layer.hasMask ? (
                  <button
                    className="rounded-md border border-[#333941] bg-[#111317] px-1.5 py-[3px] text-[10px] font-extrabold text-[#c9cdd2] hover:border-[#4aa391] hover:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731] min-[1400px]:text-[11px]"
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
            <button
              aria-expanded={openMenu?.layerId === layer.id}
              aria-label={`Layer actions for ${layer.name}`}
              className="grid h-7 w-7 cursor-default place-items-center justify-self-end rounded-md border border-[#30353d] bg-[#111317] text-sm font-black leading-none text-[#c9cdd2] hover:border-[#4aa391] hover:bg-[#203731] aria-expanded:border-[#4aa391] aria-expanded:bg-[#203731] focus-visible:border-[#4aa391] focus-visible:bg-[#203731]"
              onClick={(event) => toggleLayerMenu(event, layer.id)}
              type="button"
            >
              ...
            </button>
            <label
              className="col-[1/-1] grid grid-cols-[auto_minmax(70px,1fr)_40px] items-center gap-[7px] text-[11px] text-[#9aa1ab] min-[1400px]:text-xs"
              onClick={stopPanelControl}
            >
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
          );
        })}
      </div>
      {openMenu && !isCollapsed ? (
        <LayerMenu
          layer={layers.find((layer) => layer.id === openMenu.layerId) ?? null}
          onCommand={runLayerMenuCommand}
          onPointerDown={(event) => event.stopPropagation()}
          style={{ left: openMenu.left, top: openMenu.top }}
        />
      ) : null}
      </div>
    </section>
  );
}

function LayerTreeGuides({ depth }: { depth: number }) {
  const guideCount = Math.min(depth, 10);
  const guideWidth = guideCount * 18;
  const elbowLeft = (guideCount - 1) * 18 + 9;

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-[-10px] top-[-10px] z-0"
      style={{
        left: -guideWidth,
        width: guideWidth
      }}
    >
      {Array.from({ length: guideCount }).map((_, index) => (
        <span
          className="absolute bottom-0 top-0 w-px bg-[#313a42]"
          key={index}
          style={{ left: index * 18 + 9 }}
        />
      ))}
      <span
        className="absolute top-[31px] h-px bg-[#4a5a65]"
        style={{
          left: elbowLeft,
          width: 12
        }}
      />
      <span
        className="absolute top-[28px] h-1.5 w-1.5 rounded-full border border-[#4a5a65] bg-[#17191d]"
        style={{ left: elbowLeft + 10 }}
      />
    </span>
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

function LayerMenu({
  layer,
  onCommand,
  onPointerDown,
  style
}: {
  layer: LayerSummary | null;
  onCommand: (command: LayerCommand) => void;
  onPointerDown: (event: MouseEvent<HTMLDivElement>) => void;
  style: CSSProperties;
}) {
  if (!layer) {
    return null;
  }

  return (
    <div
      className="fixed z-40 grid max-h-[min(340px,calc(100vh-16px))] w-[190px] overflow-auto rounded-lg border border-[#333941] bg-[#111317] p-1.5 shadow-[0_18px_34px_rgba(0,0,0,0.42)]"
      onPointerDown={onPointerDown}
      style={style}
    >
      <button
        className={layerMenuButtonClass}
        onClick={() => onCommand({ type: "move-up", layerId: layer.id })}
        type="button"
      >
        Move up
      </button>
      <button
        className={layerMenuButtonClass}
        onClick={() => onCommand({ type: "move-down", layerId: layer.id })}
        type="button"
      >
        Move down
      </button>
      <button
        className={layerMenuButtonClass}
        onClick={() => onCommand({ type: "duplicate", layerId: layer.id })}
        type="button"
      >
        Duplicate
      </button>
      <button
        className={cn(
          layerMenuButtonClass,
          "hover:border-[#b96a6a] hover:bg-[#3a2023] focus-visible:border-[#b96a6a] focus-visible:bg-[#3a2023]"
        )}
        onClick={() => onCommand({ type: "delete", layerId: layer.id })}
        type="button"
      >
        Delete layer
      </button>
      <span className="mx-0.5 my-[5px] h-px bg-[#2a2d31]" />
      <button
        className={layerMenuButtonClass}
        disabled={layer.type === "group"}
        onClick={() =>
          onCommand({
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
        className={layerMenuButtonClass}
        disabled={!layer.hasMask || layer.type === "group"}
        onClick={() =>
          onCommand({
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
        className={layerMenuButtonClass}
        disabled={!layer.hasMask || layer.type === "group"}
        onClick={() => onCommand({ action: "invert", layerId: layer.id, type: "mask" })}
        type="button"
      >
        Invert mask
      </button>
      <button
        className={layerMenuButtonClass}
        disabled={!layer.hasMask || layer.type === "group"}
        onClick={() => onCommand({ action: "clear-white", layerId: layer.id, type: "mask" })}
        type="button"
      >
        Clear mask white
      </button>
      <button
        className={layerMenuButtonClass}
        disabled={!layer.hasMask || layer.type === "group"}
        onClick={() => onCommand({ action: "clear-black", layerId: layer.id, type: "mask" })}
        type="button"
      >
        Clear mask black
      </button>
    </div>
  );
}

function layerToggleClass(isOn: boolean) {
  return cn(
    "group relative grid h-[26px] w-[26px] place-items-center overflow-hidden rounded-md border border-[#30353d] bg-[#111317] text-[9px] font-extrabold leading-none text-[#8f98a3] hover:border-[#4aa391] hover:text-[#e8fffa] focus-visible:border-[#4aa391] focus-visible:text-[#e8fffa]",
    isOn && "border-[#3b5f58] bg-[#1b2d29] text-[#79dac7]"
  );
}

const layerToggleSvgClass =
  "h-[17px] fill-none stroke-current opacity-50 [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7] group-aria-pressed:opacity-100";

const layerMenuButtonClass =
  "min-h-[30px] rounded-md border border-transparent bg-transparent px-2 py-1.5 text-left text-xs font-bold text-[#e7e9ec] hover:border-[#4c535c] hover:bg-[#252930] focus-visible:border-[#4c535c] focus-visible:bg-[#252930] disabled:cursor-not-allowed disabled:text-[#6f7680] disabled:hover:border-transparent disabled:hover:bg-transparent min-[1400px]:text-[13px]";

function EyeIcon() {
  return (
    <svg aria-hidden="true" className={layerToggleSvgClass} viewBox="0 0 20 20">
      <path d="M2.4 10s2.7-4.6 7.6-4.6 7.6 4.6 7.6 4.6-2.7 4.6-7.6 4.6S2.4 10 2.4 10Z" />
      <circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" className={layerToggleSvgClass} viewBox="0 0 20 20">
      <path d="M3 3l14 14" />
      <path d="M2.4 10s2.7-4.6 7.6-4.6c1.2 0 2.3.3 3.2.7" />
      <path d="M15.5 8.1c1.4 1 2.1 1.9 2.1 1.9s-2.7 4.6-7.6 4.6c-1.1 0-2.1-.2-3-.6" />
      <path d="M8.4 8.4a2.2 2.2 0 0 0 3.1 3.1" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className={layerToggleSvgClass} viewBox="0 0 20 20">
      <rect x="4.2" y="8.3" width="11.6" height="8" rx="2" />
      <path d="M6.6 8.3V6.1a3.4 3.4 0 0 1 6.8 0v2.2" />
      <path d="M10 11.3v2.1" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg aria-hidden="true" className={layerToggleSvgClass} viewBox="0 0 20 20">
      <rect x="4.2" y="8.3" width="11.6" height="8" rx="2" />
      <path d="M6.6 8.3V6.1a3.4 3.4 0 0 1 6.4-1.6" />
      <path d="M10 11.3v2.1" />
    </svg>
  );
}
