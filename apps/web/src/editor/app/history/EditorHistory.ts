import type { SharedEditorAction } from "./SharedEditorAction";

export type HistoryEntrySummary = {
  id: string;
  isCurrent: boolean;
  isUndone: boolean;
  label: string;
};

export type HistoryStateSnapshot = {
  canRedo: boolean;
  canUndo: boolean;
  entries: HistoryEntrySummary[];
  redoLabel: string | null;
  undoLabel: string | null;
};

type EditorHistoryEntry<TSnapshot> = {
  action: SharedEditorAction;
  after: TSnapshot;
  before: TSnapshot;
};

type EditorHistoryOptions<TSnapshot> = {
  cloneSnapshot: (snapshot: TSnapshot) => TSnapshot;
  initialLabel?: string;
  limit?: number;
  mergeWindowMs?: number;
};

/**
 * Generic undo/redo stack that stores reversible editor actions with cloned snapshots.
 */
export class EditorHistory<TSnapshot> {
  private readonly cloneSnapshot: (snapshot: TSnapshot) => TSnapshot;
  private readonly limit: number;
  private readonly mergeWindowMs: number;
  private entries: Array<EditorHistoryEntry<TSnapshot>> = [];
  private index = -1;
  private initialLabel: string;
  private initialSnapshot: TSnapshot;

  constructor(initialSnapshot: TSnapshot, options: EditorHistoryOptions<TSnapshot>) {
    this.cloneSnapshot = options.cloneSnapshot;
    this.limit = Math.max(1, options.limit ?? 100);
    this.mergeWindowMs = Math.max(0, options.mergeWindowMs ?? 1000);
    this.initialLabel = options.initialLabel ?? "Initial state";
    this.initialSnapshot = this.cloneSnapshot(initialSnapshot);
  }

  reset(initialSnapshot: TSnapshot, initialLabel = this.initialLabel) {
    this.entries = [];
    this.index = -1;
    this.initialLabel = initialLabel;
    this.initialSnapshot = this.cloneSnapshot(initialSnapshot);
  }

  record(action: SharedEditorAction, before: TSnapshot, after: TSnapshot) {
    if (this.canRedo()) {
      this.entries = this.entries.slice(0, this.index + 1);
    }

    const lastEntry = this.entries[this.index];

    if (lastEntry && canMergeEntries(lastEntry.action, action, this.mergeWindowMs)) {
      lastEntry.action = action;
      lastEntry.after = this.cloneSnapshot(after);
      return;
    }

    this.entries.push({
      action,
      after: this.cloneSnapshot(after),
      before: this.cloneSnapshot(before)
    });
    this.index = this.entries.length - 1;

    if (this.entries.length > this.limit) {
      const overflow = this.entries.length - this.limit;

      this.entries.splice(0, overflow);
      this.index = Math.max(-1, this.index - overflow);
      this.initialSnapshot =
        this.entries[0]?.before ? this.cloneSnapshot(this.entries[0].before) : this.initialSnapshot;
    }
  }

  canUndo() {
    return this.index >= 0;
  }

  canRedo() {
    return this.index + 1 < this.entries.length;
  }

  undo() {
    if (!this.canUndo()) {
      return null;
    }

    const entry = this.entries[this.index];

    this.index -= 1;

    return this.cloneSnapshot(entry.before);
  }

  redo() {
    if (!this.canRedo()) {
      return null;
    }

    this.index += 1;

    return this.cloneSnapshot(this.entries[this.index].after);
  }

  getState(): HistoryStateSnapshot {
    const rootId = "history-root";
    const entries: HistoryEntrySummary[] = [
      {
        id: rootId,
        isCurrent: this.index < 0,
        isUndone: false,
        label: this.initialLabel
      },
      ...this.entries.map((entry, entryIndex) => ({
        id: entry.action.id,
        isCurrent: entryIndex === this.index,
        isUndone: entryIndex > this.index,
        label: entry.action.label
      }))
    ];

    return {
      canRedo: this.canRedo(),
      canUndo: this.canUndo(),
      entries,
      redoLabel: this.canRedo() ? this.entries[this.index + 1].action.label : null,
      undoLabel: this.canUndo() ? this.entries[this.index].action.label : null
    };
  }
}

function canMergeEntries(
  previousAction: SharedEditorAction,
  nextAction: SharedEditorAction,
  mergeWindowMs: number
) {
  if (!previousAction.mergeKey || !nextAction.mergeKey) {
    return false;
  }

  return (
    previousAction.kind === nextAction.kind &&
    previousAction.mergeKey === nextAction.mergeKey &&
    previousAction.origin === nextAction.origin &&
    nextAction.timestamp - previousAction.timestamp <= mergeWindowMs
  );
}
