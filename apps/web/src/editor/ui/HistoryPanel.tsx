type HistoryPanelProps = {
  entries: string[];
};

export function HistoryPanel({ entries }: HistoryPanelProps) {
  return (
    <section className="editor-panel history-panel" aria-label="History panel">
      <div className="panel-header">
        <h2>History</h2>
      </div>
      <ol className="history-list">
        {entries.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ol>
    </section>
  );
}
