declare module "opentype.js" {
  const opentype: {
    parse(buffer: ArrayBuffer): OpentypeFont;
  };

  export default opentype;
}

type OpentypeFont = {
  ascender: number;
  charToGlyph(character: string): OpentypeGlyph;
  charToGlyphIndex(character: string): number;
  descender: number;
  glyphs: {
    get(index: number): OpentypeGlyph;
    length: number;
  };
  names?: {
    fontFamily?: Record<string, string>;
    fontSubfamily?: Record<string, string>;
  };
  unitsPerEm: number;
};

type OpentypeGlyph = {
  advanceWidth?: number;
  getPath(x: number, y: number, fontSize: number): {
    commands: OpentypePathCommand[];
  };
  index?: number;
  unicode?: number;
  unicodes?: number[];
  xMax?: number;
  xMin?: number;
  yMax?: number;
  yMin?: number;
};

type OpentypePathCommand =
  | { type: "M" | "L"; x: number; y: number }
  | { type: "Q"; x: number; y: number; x1: number; y1: number }
  | { type: "C"; x: number; y: number; x1: number; y1: number; x2: number; y2: number }
  | { type: "Z" };
