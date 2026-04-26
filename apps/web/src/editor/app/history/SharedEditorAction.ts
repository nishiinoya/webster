export type EditorActionOrigin = "local" | "remote";

export type SharedEditorAction =
  | {
      id: string;
      kind: "command";
      label: string;
      mergeKey?: string;
      origin: EditorActionOrigin;
      payload: unknown;
      scope: "document" | "image-layer" | "layer" | "selection";
      timestamp: number;
    }
  | {
      id: string;
      kind: "gesture";
      label: string;
      mergeKey?: string;
      origin: EditorActionOrigin;
      payload?: Record<string, unknown>;
      timestamp: number;
      tool: string;
    }
  | {
      id: string;
      kind: "scene";
      label: string;
      mergeKey?: string;
      operation: string;
      origin: EditorActionOrigin;
      payload?: Record<string, unknown>;
      timestamp: number;
    }
  | {
      id: string;
      kind: "text";
      label: string;
      mergeKey?: string;
      operation: string;
      origin: EditorActionOrigin;
      payload?: Record<string, unknown>;
      timestamp: number;
    };

type OmitSharedEditorActionMeta<TAction extends SharedEditorAction> = Omit<
  TAction,
  "id" | "origin" | "timestamp"
>;

export type SharedEditorActionDraft = SharedEditorAction extends infer TAction
  ? TAction extends SharedEditorAction
    ? OmitSharedEditorActionMeta<TAction>
    : never
  : never;
