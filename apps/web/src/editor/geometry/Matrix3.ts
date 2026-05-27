/** Minimal 3x3 matrix math helpers used by editor transforms. */
import type { Point } from "./TransformGeometry";

export type Matrix3 = Float32Array;

export function transformPoint3x3(matrix: Matrix3, x: number, y: number): Point {
  return {
    x: matrix[0] * x + matrix[3] * y + matrix[6],
    y: matrix[1] * x + matrix[4] * y + matrix[7]
  };
}

export function invert3x3(matrix: Matrix3): Matrix3 | null {
  const a = matrix[0];
  const b = matrix[1];
  const c = matrix[2];
  const d = matrix[3];
  const e = matrix[4];
  const f = matrix[5];
  const g = matrix[6];
  const h = matrix[7];
  const i = matrix[8];

  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const determinant = a * A + d * D + g * G;

  if (Math.abs(determinant) < 1e-8) {
    return null;
  }

  const invDeterminant = 1 / determinant;

  return new Float32Array([
    A * invDeterminant,
    D * invDeterminant,
    G * invDeterminant,
    B * invDeterminant,
    E * invDeterminant,
    H * invDeterminant,
    C * invDeterminant,
    F * invDeterminant,
    I * invDeterminant
  ]);
}
