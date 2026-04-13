type PropertiesPanelProps = {
  selectedLayer: {
    height: number;
    locked: boolean;
    name: string;
    opacity: number;
    width: number;
    x: number;
    y: number;
  } | null;
  selectedTool: string;
};

export function PropertiesPanel({ selectedLayer, selectedTool }: PropertiesPanelProps) {
  const propertyRows = selectedLayer
    ? [
        ["X", `${Math.round(selectedLayer.x)} px`],
        ["Y", `${Math.round(selectedLayer.y)} px`],
        ["Width", `${Math.round(selectedLayer.width)} px`],
        ["Height", `${Math.round(selectedLayer.height)} px`],
        ["Opacity", `${Math.round(selectedLayer.opacity * 100)}%`],
        ["Locked", selectedLayer.locked ? "Yes" : "No"]
      ]
    : [
        ["X", "-"],
        ["Y", "-"],
        ["Width", "-"],
        ["Height", "-"],
        ["Opacity", "-"],
        ["Locked", "-"]
      ];

  return (
    <section className="editor-panel" aria-label="Properties panel">
      <div className="panel-header">
        <h2>Properties</h2>
      </div>
      <dl className="property-list">
        <div>
          <dt>Tool</dt>
          <dd>{selectedTool}</dd>
        </div>
        <div>
          <dt>Layer</dt>
          <dd>{selectedLayer?.name ?? "None"}</dd>
        </div>
        {propertyRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
