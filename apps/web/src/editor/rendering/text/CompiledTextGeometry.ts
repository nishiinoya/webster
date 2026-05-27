import { TextLayer } from "../../layers/TextLayer";
import type { BitmapTextRect } from "./BitmapText";
import type { RuntimeFont } from "./FontLoader";

export type CompiledTextGeometry = {
  caret: BitmapTextRect;
  characterBoxes: TextCharacterBox[];
  indices: Uint16Array | Uint32Array;
  maskFrame: BitmapTextRect;
  texCoords: Float32Array;
  vertices: Float32Array;
};

export type TextCharacterBox = BitmapTextRect & {
  index: number;
};

type LineLayout = {
  text: string;
  width: number;
};

export type CompiledTextStyleOptions = {
  synthesizeBold?: boolean;
  synthesizeItalic?: boolean;
};

export function buildCompiledTextGeometry(
  layer: TextLayer,
  font: RuntimeFont,
  caretIndex = layer.text.length,
  styleOptions: CompiledTextStyleOptions = {}
): CompiledTextGeometry {
  const scale = layer.fontSize / font.unitsPerEm;
  const lineHeight = layer.fontSize * 1.25;
  const boldOffset = styleOptions.synthesizeBold ? Math.max(0.75, layer.fontSize * 0.035) : 0;
  const italicSlant = styleOptions.synthesizeItalic ? 0.18 : 0;
  const lines = splitLines(layer.text);
  const lineLayouts = lines.map((line) => ({
    text: line,
    width: getLineWidth(line, font, scale)
  }));
  const maskFrame = getCompiledTextMaskFrame(layer, lineLayouts, font, scale, lineHeight);
  const vertices: number[] = [];
  const texCoords: number[] = [];
  const indices: number[] = [];
  const characterBoxes: TextCharacterBox[] = [];
  let textIndex = 0;
  let caret = createCaret(layer, 0, layer.height, lineHeight);

  for (let lineIndex = 0; lineIndex < lineLayouts.length; lineIndex += 1) {
    const line = lineLayouts[lineIndex];
    const startX = getLineStartX(layer, line.width);
    const baselineY = layer.height - font.ascender * scale - lineIndex * lineHeight;
    let cursorX = startX;

    if (caretIndex === textIndex) {
      caret = createCaret(layer, cursorX, baselineY + font.ascender * scale, lineHeight);
    }

    for (const char of line.text) {
      const glyph = font.getGlyphGeometry(char);

      if (glyph) {
        const advanceWidth = glyph.advanceWidth * scale;

        characterBoxes.push({
          height: lineHeight,
          index: textIndex,
          width: Math.max(1, advanceWidth),
          x: cursorX,
          y: baselineY + font.ascender * scale - lineHeight
        });
        appendGlyph(vertices, texCoords, indices, glyph.vertices, glyph.indices, {
          ascender: font.ascender,
          boldOffset,
          cursorX,
          italicSlant,
          baselineY,
          maskFrame,
          scale
        });

        cursorX += advanceWidth;
      }

      textIndex += 1;

      if (caretIndex === textIndex) {
        caret = createCaret(layer, cursorX, baselineY + font.ascender * scale, lineHeight);
      }
    }

    if (lineIndex < lineLayouts.length - 1) {
      textIndex += 1;

      if (caretIndex === textIndex) {
        const nextLine = lineLayouts[lineIndex + 1];
        caret = createCaret(
          layer,
          getLineStartX(layer, nextLine.width),
          baselineY + font.ascender * scale - lineHeight,
          lineHeight
        );
      }
    }
  }

  const clippedGeometry = clipGeometryToLayer(vertices, texCoords, indices, layer);
  const indexArray =
    clippedGeometry.vertices.length / 2 > 65535
      ? new Uint32Array(clippedGeometry.indices)
      : new Uint16Array(clippedGeometry.indices);

  return {
    caret,
    characterBoxes,
    indices: indexArray,
    maskFrame,
    texCoords: new Float32Array(clippedGeometry.texCoords),
    vertices: new Float32Array(clippedGeometry.vertices)
  };
}

function appendGlyph(
  vertices: number[],
  texCoords: number[],
  indices: number[],
  glyphVertices: number[],
  glyphIndices: number[],
  options: {
    ascender: number;
    baselineY: number;
    boldOffset: number;
    cursorX: number;
    italicSlant: number;
    maskFrame: BitmapTextRect;
    scale: number;
  }
) {
  if (options.boldOffset > 0) {
    const halfBoldOffset = options.boldOffset / 2;

    appendGlyphInstance(
      vertices,
      texCoords,
      indices,
      glyphVertices,
      glyphIndices,
      options,
      -halfBoldOffset
    );
    appendGlyphInstance(
      vertices,
      texCoords,
      indices,
      glyphVertices,
      glyphIndices,
      options,
      halfBoldOffset
    );
    return;
  }

  appendGlyphInstance(vertices, texCoords, indices, glyphVertices, glyphIndices, options, 0);
}

function appendGlyphInstance(
  vertices: number[],
  texCoords: number[],
  indices: number[],
  glyphVertices: number[],
  glyphIndices: number[],
  options: {
    ascender: number;
    baselineY: number;
    cursorX: number;
    italicSlant: number;
    maskFrame: BitmapTextRect;
    scale: number;
  },
  offsetX: number
) {
  const vertexOffset = vertices.length / 2;

  for (let index = 0; index < glyphVertices.length; index += 2) {
    const glyphX = glyphVertices[index] * options.scale;
    const glyphY = glyphVertices[index + 1] * options.scale;
    const italicOffset = (options.ascender * options.scale - glyphY) * options.italicSlant;
    const x = options.cursorX + glyphX + italicOffset + offsetX;
    const y = options.baselineY + glyphY;

    vertices.push(x, y);
    texCoords.push(
      (x - options.maskFrame.x) / options.maskFrame.width,
      (y - options.maskFrame.y) / options.maskFrame.height
    );
  }

  for (const index of glyphIndices) {
    indices.push(vertexOffset + index);
  }
}

function splitLines(text: string) {
  return text.split("\n");
}

function getLineWidth(line: string, font: RuntimeFont, scale: number) {
  let width = 0;

  for (const char of line) {
    const glyph = font.getGlyphGeometry(char);

    width += (glyph?.advanceWidth ?? font.unitsPerEm * 0.5) * scale;
  }

  return width;
}

function getLineStartX(layer: TextLayer, lineWidth: number) {
  if (layer.align === "center") {
    return (layer.width - lineWidth) / 2;
  }

  if (layer.align === "right") {
    return layer.width - lineWidth;
  }

  return 0;
}

function getCompiledTextMaskFrame(
  layer: TextLayer,
  lines: LineLayout[],
  font: RuntimeFont,
  scale: number,
  lineHeight: number
): BitmapTextRect {
  const visibleLineCount = Math.max(1, lines.length);
  const fallbackWidth = font.unitsPerEm * scale * 0.5;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;

  for (const line of lines) {
    const lineWidth = Math.max(fallbackWidth, line.width);
    const startX = getLineStartX(layer, lineWidth);

    left = Math.min(left, startX);
    right = Math.max(right, startX + lineWidth);
  }

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    left = 0;
    right = fallbackWidth;
  }

  return {
    x: left,
    y: layer.height - visibleLineCount * lineHeight,
    width: Math.max(1, right - left),
    height: Math.max(1, visibleLineCount * lineHeight)
  };
}

function createCaret(layer: TextLayer, localX: number, topY: number, lineHeight: number) {
  return {
    x: Math.min(Math.max(localX, 0), layer.width),
    y: topY - lineHeight,
    width: Math.max(1, layer.fontSize / 28),
    height: lineHeight
  };
}

function clipGeometryToLayer(
  vertices: number[],
  texCoords: number[],
  indices: number[],
  layer: TextLayer
) {
  const clippedVertices: number[] = [];
  const clippedTexCoords: number[] = [];
  const clippedIndices: number[] = [];

  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]].map(
      (vertexIndex) => ({
        u: texCoords[vertexIndex * 2],
        v: texCoords[vertexIndex * 2 + 1],
        x: vertices[vertexIndex * 2],
        y: vertices[vertexIndex * 2 + 1]
      })
    );
    const clippedTriangle = clipPolygonToRectangle(triangle, layer.width, layer.height);

    if (clippedTriangle.length < 3) {
      continue;
    }

    const baseIndex = clippedVertices.length / 2;

    for (const point of clippedTriangle) {
      clippedVertices.push(point.x, point.y);
      clippedTexCoords.push(point.u, point.v);
    }

    for (let pointIndex = 1; pointIndex < clippedTriangle.length - 1; pointIndex += 1) {
      clippedIndices.push(baseIndex, baseIndex + pointIndex, baseIndex + pointIndex + 1);
    }
  }

  return {
    indices: clippedIndices,
    texCoords: clippedTexCoords,
    vertices: clippedVertices
  };
}

type ClipPoint = {
  u: number;
  v: number;
  x: number;
  y: number;
};

function clipPolygonToRectangle(points: ClipPoint[], width: number, height: number) {
  return clipPolygon(
    clipPolygon(
      clipPolygon(
        clipPolygon(points, (point) => point.x >= 0, (start, end) => intersectX(start, end, 0)),
        (point) => point.x <= width,
        (start, end) => intersectX(start, end, width)
      ),
      (point) => point.y >= 0,
      (start, end) => intersectY(start, end, 0)
    ),
    (point) => point.y <= height,
    (start, end) => intersectY(start, end, height)
  );
}

function clipPolygon(
  points: ClipPoint[],
  isInside: (point: ClipPoint) => boolean,
  intersect: (start: ClipPoint, end: ClipPoint) => ClipPoint
) {
  const output: ClipPoint[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = isInside(current);
    const previousInside = isInside(previous);

    if (currentInside) {
      if (!previousInside) {
        output.push(intersect(previous, current));
      }

      output.push(current);
    } else if (previousInside) {
      output.push(intersect(previous, current));
    }
  }

  return output;
}

function intersectX(start: ClipPoint, end: ClipPoint, x: number) {
  return interpolateClipPoint(start, end, getInterpolationAmount(x - start.x, end.x - start.x));
}

function intersectY(start: ClipPoint, end: ClipPoint, y: number) {
  return interpolateClipPoint(start, end, getInterpolationAmount(y - start.y, end.y - start.y));
}

function getInterpolationAmount(numerator: number, denominator: number) {
  if (Math.abs(denominator) < 1e-6) {
    return 0;
  }

  return numerator / denominator;
}

function interpolateClipPoint(start: ClipPoint, end: ClipPoint, amount: number) {
  return {
    u: start.u + (end.u - start.u) * amount,
    v: start.v + (end.v - start.v) * amount,
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount
  };
}
