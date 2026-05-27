import type { CompiledGlyph } from "./CompiledFont";
import { compileGlyphMesh } from "./GlyphMeshCompiler";

type FontLike = {
  charToGlyph(character: string): GlyphLike;
  charToGlyphIndex?(character: string): number;
  glyphs: {
    get(index: number): GlyphLike;
  };
  unitsPerEm: number;
};

type GlyphLike = {
  index?: number;
  unicode?: number;
  unicodes?: number[];
};

export class GlyphMeshCache {
  private readonly glyphMeshes = new Map<number, CompiledGlyph>();

  constructor(
    private readonly font: FontLike,
    private readonly supportedCodepoints: Set<number>,
    private readonly fontLabel: {
      family: string;
      style: string;
    }
  ) {}

  preloadBasicGlyphs() {
    for (const character of basicGlyphSet) {
      this.getGlyphGeometry(character);
    }
  }

  getGlyphGeometry(character: string) {
    const codepoint = character.codePointAt(0);
    const isSupported = codepoint !== undefined && this.supportedCodepoints.has(codepoint);
    const glyph = isSupported ? this.font.charToGlyph(character) : this.getMissingGlyph();

    if (!isSupported) {
      console.warn(
        `[FontLoader] Missing glyph in ${this.fontLabel.family} ${this.fontLabel.style}: "${character}" ${
          codepoint !== undefined
            ? `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`
            : ""
        }`
      );
    }

    const glyphIndex = getGlyphIndex(glyph, this.font.charToGlyphIndex?.(character) ?? 0);
    const cachedMesh = this.glyphMeshes.get(glyphIndex);

    if (cachedMesh) {
      return cachedMesh;
    }

    const mesh = compileGlyphMesh(glyph as Parameters<typeof compileGlyphMesh>[0], this.font.unitsPerEm);

    this.glyphMeshes.set(glyphIndex, mesh);

    return mesh;
  }

  private getMissingGlyph() {
    return this.font.glyphs.get(0) ?? this.font.charToGlyph("?");
  }
}

const basicGlyphSet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "abcdefghijklmnopqrstuvwxyz" +
  "0123456789" +
  " .,!?;:'\"-_/\\()[]{}@#$%&*+=<>|";

function getGlyphIndex(glyph: GlyphLike, fallbackIndex: number) {
  return glyph.index ?? fallbackIndex;
}
