/** Types describing compiled font assets and glyph geometry. */
export type CompiledFontManifest = {
  fonts: CompiledFontManifestEntry[];
};

export type CompiledFontManifestEntry = {
  family: string;
  italic?: boolean;
  style?: string;
  url: string;
  weight?: number;
};

export type CompiledFont = {
  ascender: number;
  descender: number;
  family: string;
  glyphs: Record<string, CompiledGlyph>;
  lineGap: number;
  style: string;
  unitsPerEm: number;
  version: 1;
};

export type CompiledGlyph = {
  advanceWidth: number;
  indices: number[];
  vertices: number[];
  xMax: number;
  xMin: number;
  yMax: number;
  yMin: number;
};
