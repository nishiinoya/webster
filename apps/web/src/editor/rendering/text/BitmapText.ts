import { TextLayer } from "../../layers/TextLayer";

export type BitmapTextRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type BitmapTextLayout = {
  caret: BitmapTextRect;
  characterBoxes: BitmapTextCharacterBox[];
  glyphs: BitmapTextRect[];
  maskFrame: BitmapTextRect;
};

export type BitmapTextCharacterBox = BitmapTextRect & {
  index: number;
};

const glyphs: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00100"],
  ",": ["00000", "00000", "00000", "00000", "00000", "00100", "01000"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  ";": ["00000", "00100", "00100", "00000", "00100", "01000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "\\": ["10000", "01000", "01000", "00100", "00010", "00010", "00001"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"]
};

const fallbackGlyph = glyphs["?"];

export function layoutBitmapText(layer: TextLayer, caretIndex = layer.text.length): BitmapTextLayout {
  const cellSize = Math.max(1, layer.fontSize / 7);
  const glyphWidth = cellSize * 5;
  const advance = cellSize * 6;
  const lineHeight = layer.fontSize * 1.25;
  const lines = splitLines(layer.text);
  const characterBoxes: BitmapTextCharacterBox[] = [];
  const glyphRects: BitmapTextRect[] = [];
  const maskFrame = computeTextMaskFrame(layer, lines, glyphWidth, advance, lineHeight);
  let textIndex = 0;
  let caret = createCaret(layer, 0, 0, cellSize, lineHeight);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineWidth = getLineWidth(line.length, glyphWidth, advance);
    const startX = getLineStartX(layer, lineWidth);
    const topY = layer.height - lineIndex * lineHeight;

    if (caretIndex === textIndex) {
      caret = createCaret(layer, startX, topY, cellSize, lineHeight);
    }

    for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
      const char = line[charIndex];
      const pattern = getGlyphPattern(char);
      const charX = startX + charIndex * advance;

      characterBoxes.push({
        height: lineHeight,
        index: textIndex,
        width: advance,
        x: charX,
        y: topY - lineHeight
      });

      for (let row = 0; row < pattern.length; row += 1) {
        const italicOffset = layer.italic ? (pattern.length - row - 1) * cellSize * 0.28 : 0;

        for (let column = 0; column < pattern[row].length; column += 1) {
          if (pattern[row][column] !== "1") {
            continue;
          }

          glyphRects.push({
            x: charX + column * cellSize + italicOffset,
            y: topY - (row + 1) * cellSize,
            width: layer.bold ? cellSize * 1.28 : cellSize,
            height: cellSize
          });
        }
      }

      textIndex += 1;

      if (caretIndex === textIndex) {
        caret = createCaret(layer, charX + advance, topY, cellSize, lineHeight);
      }
    }

    if (lineIndex < lines.length - 1) {
      textIndex += 1;

      if (caretIndex === textIndex) {
        caret = createCaret(layer, getLineStartX(layer, getLineWidth(lines[lineIndex + 1].length, glyphWidth, advance)), topY - lineHeight, cellSize, lineHeight);
      }
    }
  }

  return {
    caret,
    characterBoxes,
    glyphs: glyphRects,
    maskFrame
  };
}

export function getTextMaskFrame(layer: TextLayer): BitmapTextRect {
  const cellSize = Math.max(1, layer.fontSize / 7);
  const glyphWidth = cellSize * 5;
  const advance = cellSize * 6;
  const lineHeight = layer.fontSize * 1.25;

  return computeTextMaskFrame(layer, splitLines(layer.text), glyphWidth, advance, lineHeight);
}

function splitLines(text: string) {
  return text.split("\n");
}

function getGlyphPattern(char: string) {
  return glyphs[char.toUpperCase()] ?? fallbackGlyph;
}

function getLineWidth(length: number, glyphWidth: number, advance: number) {
  return length > 0 ? glyphWidth + (length - 1) * advance : 0;
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

function computeTextMaskFrame(
  layer: TextLayer,
  lines: string[],
  glyphWidth: number,
  advance: number,
  lineHeight: number
): BitmapTextRect {
  const visibleLineCount = Math.max(1, lines.length);
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;

  for (const line of lines) {
    const lineWidth = Math.max(glyphWidth, getLineWidth(line.length, glyphWidth, advance));
    const startX = getLineStartX(layer, lineWidth);

    left = Math.min(left, startX);
    right = Math.max(right, startX + lineWidth);
  }

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    left = 0;
    right = glyphWidth;
  }

  return {
    x: left,
    y: layer.height - visibleLineCount * lineHeight,
    width: Math.max(1, right - left),
    height: Math.max(1, visibleLineCount * lineHeight)
  };
}

function createCaret(
  layer: TextLayer,
  localX: number,
  topY: number,
  cellSize: number,
  lineHeight: number
): BitmapTextRect {
  return {
    x: Math.min(Math.max(localX, 0), layer.width),
    y: topY - lineHeight,
    width: Math.max(1, cellSize * 0.35),
    height: lineHeight
  };
}
