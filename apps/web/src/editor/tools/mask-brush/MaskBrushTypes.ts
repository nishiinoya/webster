/** Shared mask brush option types. */
export type MaskBrushMode = "hide" | "reveal";

export type MaskBrushOptions = {
  mode: MaskBrushMode;
  opacity: number;
  size: number;
};
