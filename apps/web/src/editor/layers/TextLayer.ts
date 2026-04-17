import { Layer } from "./Layer";
import type { LayerOptions, SerializedTextLayer } from "./Layer";
import type { BitmapTextRect } from "../rendering/text/BitmapText";
import type { TextCharacterBox } from "../rendering/text/CompiledTextGeometry";
import type { ResolvedRuntimeFont } from "../rendering/text/FontLoader";

export type TextAlign = "left" | "center" | "right";

export type TextLayerOptions = Omit<LayerOptions, "type"> & {
  align?: TextAlign;
  bold?: boolean;
  color?: [number, number, number, number];
  fontFamily?: string;
  fontSize?: number;
  italic?: boolean;
  text?: string;
};

export class TextLayer extends Layer {
  align: TextAlign;
  bold: boolean;
  color: [number, number, number, number];
  fontFamily: string;
  fontSize: number;
  italic: boolean;
  text: string;
  lastResolvedCompiledFont: ResolvedRuntimeFont | null = null;
  lastTextCharacterBoxes: TextCharacterBox[] = [];
  lastTextMaskFrame: BitmapTextRect | null = null;

  constructor(options: TextLayerOptions) {
    super({
      ...options,
      type: "text"
    });

    this.align = options.align ?? "left";
    this.bold = options.bold ?? false;
    this.color = options.color ?? [0.05, 0.06, 0.07, 1];
    this.fontFamily = options.fontFamily ?? "Arial";
    this.fontSize = options.fontSize ?? 48;
    this.italic = options.italic ?? false;
    this.text = options.text ?? "Text";
  }

  toJSON(): SerializedTextLayer {
    return {
      ...this.toJSONBase(),
      align: this.align,
      bold: this.bold,
      color: this.color,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      italic: this.italic,
      text: this.text,
      type: "text"
    };
  }
}
