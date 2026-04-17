import opentype from "opentype.js";
import type { CompiledFontManifest, CompiledFontManifestEntry, CompiledGlyph } from "./CompiledFont";
import { GlyphMeshCache } from "./GlyphMeshCache";

export type RuntimeFont = {
  ascender: number;
  descender: number;
  entry: CompiledFontManifestEntry;
  family: string;
  getGlyphGeometry(character: string): CompiledGlyph;
  lineGap: number;
  style: string;
  supportedCodepoints: Set<number>;
  unitsPerEm: number;
};

export type ResolvedRuntimeFont = {
  font: RuntimeFont;
  isFallbackWhileLoading: boolean;
  synthesizeBold: boolean;
  synthesizeItalic: boolean;
};

type LoadedFontEntry = {
  entry: CompiledFontManifestEntry;
  font: RuntimeFont;
};

export class FontLoader {
  private readonly fonts = new Map<string, LoadedFontEntry>();
  private readonly loadingFonts = new Map<string, Promise<LoadedFontEntry | null>>();
  private readonly fallbackFonts = new Map<string, ResolvedRuntimeFont>();
  private readonly familyFallbackFonts = new Map<string, ResolvedRuntimeFont>();
  private lastResolvedFont: ResolvedRuntimeFont | null = null;

  private constructor(private readonly entries: CompiledFontManifestEntry[]) {}

  static async create(manifestUrl = "/fonts/font-manifest.json") {
    try {
      const response = await fetch(manifestUrl);

      if (!response.ok) {
        return new FontLoader([]);
      }

      const manifest = (await response.json()) as CompiledFontManifest;

      return new FontLoader(Array.isArray(manifest.fonts) ? manifest.fonts : []);
    } catch {
      return new FontLoader([]);
    }
  }

  requestFont(family: string, bold: boolean, italic: boolean) {
    const entry = this.findEntry(family, bold, italic);

    if (!entry) {
      return null;
    }

    const key = getEntryKey(entry);
    const requestKey = getRequestKey(family, bold, italic);
    const familyKey = getFamilyKey(family);
    const loadedFont = this.fonts.get(key);

    if (loadedFont) {
      const resolvedFont = resolveFontStyle(loadedFont, bold, italic, false);

      this.fallbackFonts.set(requestKey, resolvedFont);
      this.familyFallbackFonts.set(familyKey, resolvedFont);
      this.lastResolvedFont = resolvedFont;

      return resolvedFont;
    }

    if (!this.loadingFonts.has(key)) {
      this.loadingFonts.set(key, this.loadFont(entry, key));
    }

    const fallback =
      this.fallbackFonts.get(requestKey) ??
      this.familyFallbackFonts.get(familyKey) ??
      this.lastResolvedFont;

    return fallback
      ? {
          ...fallback,
          isFallbackWhileLoading: true
        }
      : null;
  }

  async ensureFont(family: string, bold: boolean, italic: boolean) {
    const entry = this.findEntry(family, bold, italic);

    if (!entry) {
      return null;
    }

    const key = getEntryKey(entry);
    const requestKey = getRequestKey(family, bold, italic);
    const familyKey = getFamilyKey(family);
    const loadedFont = this.fonts.get(key);

    if (loadedFont) {
      const resolvedFont = resolveFontStyle(loadedFont, bold, italic, false);

      this.fallbackFonts.set(requestKey, resolvedFont);
      this.familyFallbackFonts.set(familyKey, resolvedFont);
      this.lastResolvedFont = resolvedFont;

      return resolvedFont;
    }

    let promise = this.loadingFonts.get(key);

    if (!promise) {
      promise = this.loadFont(entry, key);
      this.loadingFonts.set(key, promise);
    }

    const resolved = await promise;

    if (!resolved) {
      return null;
    }

    const resolvedFont = resolveFontStyle(resolved, bold, italic, false);

    this.fallbackFonts.set(requestKey, resolvedFont);
    this.familyFallbackFonts.set(familyKey, resolvedFont);
    this.lastResolvedFont = resolvedFont;

    return resolvedFont;
  }

  private async loadFont(entry: CompiledFontManifestEntry, key: string) {
    try {
      const response = await fetch(entry.url);

      if (!response.ok) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const parsedFont = opentype.parse(arrayBuffer);
      const supportedCodepoints = getSupportedCodepoints(parsedFont);
      const fontFamily = getEnglishName(parsedFont.names?.fontFamily) ?? entry.family;
      const fontStyle = getEnglishName(parsedFont.names?.fontSubfamily) ?? entry.style ?? "Regular";
      const glyphMeshCache = new GlyphMeshCache(parsedFont, supportedCodepoints, {
        family: fontFamily,
        style: fontStyle
      });

      glyphMeshCache.preloadBasicGlyphs();
      logSupportedFontCharacters(fontFamily, fontStyle, supportedCodepoints);

      const runtimeFont: RuntimeFont = {
        ascender: parsedFont.ascender,
        descender: parsedFont.descender,
        entry,
        family: fontFamily,
        getGlyphGeometry: (character) => glyphMeshCache.getGlyphGeometry(character),
        lineGap: 0,
        style: fontStyle,
        supportedCodepoints,
        unitsPerEm: parsedFont.unitsPerEm
      };
      const loadedFont = {
        entry,
        font: runtimeFont
      };

      this.fonts.set(key, loadedFont);

      return loadedFont;
    } catch {
      return null;
    } finally {
      this.loadingFonts.delete(key);
    }
  }

  private findEntry(family: string, bold: boolean, italic: boolean) {
    const normalizedFamily = normalizeFontFamily(family);
    const familyEntries = this.entries.filter(
      (entry) => normalizeFontFamily(entry.family) === normalizedFamily
    );

    if (familyEntries.length === 0) {
      return null;
    }

    const targetWeight = bold ? 700 : 400;

    return familyEntries
      .map((entry) => ({
        entry,
        score:
          Math.abs((entry.weight ?? 400) - targetWeight) +
          (Boolean(entry.italic) === italic ? 0 : 1000)
      }))
      .sort((a, b) => a.score - b.score)[0].entry;
  }
}

function getSupportedCodepoints(font: {
  glyphs: {
    get(index: number): { unicode?: number; unicodes?: number[] };
    length: number;
  };
}) {
  const supportedCodepoints = new Set<number>();

  for (let index = 0; index < font.glyphs.length; index += 1) {
    const glyph = font.glyphs.get(index);

    if (glyph.unicode !== undefined) {
      supportedCodepoints.add(glyph.unicode);
    }

    for (const unicode of glyph.unicodes ?? []) {
      supportedCodepoints.add(unicode);
    }
  }

  return supportedCodepoints;
}

function logSupportedFontCharacters(
  family: string,
  style: string,
  supportedCodepoints: Set<number>
) {
  const sortedCodepoints = [...supportedCodepoints].sort((a, b) => a - b);
  const supportedCharacters = sortedCodepoints
    .map((codepoint) => String.fromCodePoint(codepoint))
    .join("");
  const codepointLabels = sortedCodepoints.map(
    (codepoint) => `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`
  );

  console.groupCollapsed(
    `[FontLoader] ${family} ${style}: ${sortedCodepoints.length} supported characters`
  );
  console.log("characters:", supportedCharacters);
  console.log("codepoints:", codepointLabels);
  console.groupEnd();
}

function getEnglishName(name?: Record<string, string>) {
  if (!name) {
    return null;
  }

  return name.en ?? Object.values(name)[0] ?? null;
}

function normalizeFontFamily(family: string) {
  return family.trim().toLowerCase();
}

function getFamilyKey(family: string) {
  return normalizeFontFamily(family);
}

function getRequestKey(family: string, bold: boolean, italic: boolean) {
  return `${normalizeFontFamily(family)}:${bold ? "bold" : "normal"}:${italic ? "italic" : "normal"}`;
}

function getEntryKey(entry: CompiledFontManifestEntry) {
  return `${normalizeFontFamily(entry.family)}:${entry.weight ?? 400}:${entry.italic ? "italic" : "normal"}:${entry.url}`;
}

function resolveFontStyle(
  loadedFont: LoadedFontEntry,
  requestedBold: boolean,
  requestedItalic: boolean,
  isFallbackWhileLoading: boolean
): ResolvedRuntimeFont {
  const loadedBold = (loadedFont.entry.weight ?? 400) >= 600;
  const loadedItalic = Boolean(loadedFont.entry.italic);

  return {
    font: loadedFont.font,
    isFallbackWhileLoading,
    synthesizeBold: requestedBold && !loadedBold,
    synthesizeItalic: requestedItalic && !loadedItalic
  };
}
