export type EditorDocumentTab = {
  height: number;
  id: string;
  isActive: boolean;
  source?: 'local-file' | 'local-only' | 'shared';
  title: string;
  width: number;
};

export type NewDocumentSize = {
  height: number;
  width: number;
};
