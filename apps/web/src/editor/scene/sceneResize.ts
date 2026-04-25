export type DocumentResizeAnchor =
  | "bottom"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "left"
  | "right"
  | "top"
  | "top-left"
  | "top-right";

/**
 * Clamps a numeric value into the provided inclusive range.
 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Normalizes a requested document size into the supported editor range.
 */
export function clampDocumentSize(value: number) {
  if (!Number.isFinite(value)) {
    return 800;
  }

  return Math.min(Math.max(Math.round(value), 1), 12000);
}

/**
 * Computes how much the document origin should shift for a given resize anchor.
 */
export function getDocumentResizeOffset(
  deltaWidth: number,
  deltaHeight: number,
  anchor: DocumentResizeAnchor
) {
  const horizontal = anchor.includes("left")
    ? 0
    : anchor.includes("right")
      ? -deltaWidth
      : -deltaWidth / 2;
  const vertical = anchor.includes("bottom")
    ? 0
    : anchor.includes("top")
      ? -deltaHeight
      : -deltaHeight / 2;

  return { x: horizontal, y: vertical };
}

/**
 * Wraps any rotation into the `[0, 360)` range used by the editor.
 */
export function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}
