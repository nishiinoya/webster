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

export type ImportedFontSummary = {
  family: string;
  id: string;
  italic: boolean;
  mimeType: string;
  name: string;
  style: string;
  weight: number;
};

export class FontLoader {
  private readonly fonts = new Map<string, LoadedFontEntry>();
  private readonly loadingFonts = new Map<string, Promise<LoadedFontEntry | null>>();
  private readonly fallbackFonts = new Map<string, ResolvedRuntimeFont>();
  private readonly familyFallbackFonts = new Map<string, ResolvedRuntimeFont>();
  private readonly importedFontSummaries = new Map<string, ImportedFontSummary>();
  private lastResolvedFont: ResolvedRuntimeFont | null = null;

  private constructor(private entries: CompiledFontManifestEntry[]) {}

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

  async addFontFile(file: File): Promise<ImportedFontSummary> {
    return this.addFontBlob(file, {
      mimeType: file.type || getFontMimeType(file.name),
      name: file.name
    });
  }

  async addFontBlob(
    blob: Blob,
    options: Partial<ImportedFontSummary> & { name: string }
  ): Promise<ImportedFontSummary> {
    if (options.id) {
      const existing = this.importedFontSummaries.get(options.id);

      if (existing) {
        return existing;
      }
    }

    const parsedFont = opentype.parse(await blob.arrayBuffer());
    const fontFamily =
      options.family?.trim() ||
      getEnglishName(parsedFont.names?.fontFamily)?.trim() ||
      stripFontExtension(options.name) ||
      "Imported Font";
    const fontStyle =
      options.style?.trim() ||
      getEnglishName(parsedFont.names?.fontSubfamily)?.trim() ||
      "Regular";
    const id = options.id || crypto.randomUUID();
    const entry: CompiledFontManifestEntry = {
      family: fontFamily,
      italic: options.italic ?? isItalicFontStyle(fontStyle),
      style: fontStyle,
      url: `user-font:${id}:${options.name}`,
      weight: options.weight ?? inferFontWeight(fontStyle)
    };
    const key = getEntryKey(entry);
    const loadedFont = this.createLoadedFont(entry, parsedFont);
    const resolvedFont = resolveFontStyle(
      loadedFont,
      (entry.weight ?? 400) >= 600,
      Boolean(entry.italic),
      false
    );

    this.entries = [
      entry,
      ...this.entries.filter((candidate) => getEntryKey(candidate) !== key)
    ];
    this.fonts.set(key, loadedFont);
    this.familyFallbackFonts.set(getFamilyKey(entry.family), resolvedFont);
    this.lastResolvedFont = resolvedFont;

    const summary = {
      family: loadedFont.font.family,
      id,
      italic: Boolean(entry.italic),
      mimeType: options.mimeType || getFontMimeType(options.name),
      name: options.name,
      style: loadedFont.font.style,
      weight: entry.weight ?? 400
    };

    this.importedFontSummaries.set(id, summary);

    return summary;
  }

  private async loadFont(entry: CompiledFontManifestEntry, key: string) {
    try {
      const response = await fetch(entry.url);

      if (!response.ok) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const parsedFont = opentype.parse(arrayBuffer);
      const loadedFont = this.createLoadedFont(entry, parsedFont);

      this.fonts.set(key, loadedFont);

      return loadedFont;
    } catch {
      return null;
    } finally {
      this.loadingFonts.delete(key);
    }
  }

  private createLoadedFont(entry: CompiledFontManifestEntry, parsedFont: OpentypeFont) {
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

    return {
      entry,
      font: runtimeFont
    };
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

function stripFontExtension(filename: string) {
  return filename.replace(/\.(otf|ttf|woff|sfnt)$/iu, "").trim();
}

function getFontMimeType(filename: string) {
  if (/\.woff$/iu.test(filename)) {
    return "font/woff";
  }

  if (/\.otf$/iu.test(filename)) {
    return "font/otf";
  }

  return "font/ttf";
}

function inferFontWeight(style: string) {
  const normalizedStyle = style.toLowerCase();

  if (normalizedStyle.includes("thin")) {
    return 100;
  }

  if (normalizedStyle.includes("extra light") || normalizedStyle.includes("extralight")) {
    return 200;
  }

  if (normalizedStyle.includes("light")) {
    return 300;
  }

  if (normalizedStyle.includes("medium")) {
    return 500;
  }

  if (normalizedStyle.includes("semi bold") || normalizedStyle.includes("semibold")) {
    return 600;
  }

  if (normalizedStyle.includes("extra bold") || normalizedStyle.includes("extrabold")) {
    return 800;
  }

  if (normalizedStyle.includes("black") || normalizedStyle.includes("heavy")) {
    return 900;
  }

  if (normalizedStyle.includes("bold")) {
    return 700;
  }

  return 400;
}

function isItalicFontStyle(style: string) {
  return /italic|oblique/iu.test(style);
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
