type PropertiesPanelProps = {
  selectedLayerName: string;
  selectedTool: string;
};

const propertyRows = [
  ["X", "0 px"],
  ["Y", "0 px"],
  ["Width", "1200 px"],
  ["Height", "800 px"],
  ["Opacity", "100%"]
];

export function PropertiesPanel({ selectedLayerName, selectedTool }: PropertiesPanelProps) {
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
          <dd>{selectedLayerName}</dd>
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
