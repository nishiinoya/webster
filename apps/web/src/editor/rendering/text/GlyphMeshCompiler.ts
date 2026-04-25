/** Glyph outline flattening and triangulation helpers. */
import earcut from "earcut";
import type { CompiledGlyph } from "./CompiledFont";

type GlyphLike = {
  advanceWidth?: number;
  getPath(x: number, y: number, fontSize: number): {
    commands: PathCommand[];
  };
  xMax?: number;
  xMin?: number;
  yMax?: number;
  yMin?: number;
};

type PathCommand =
  | { type: "M" | "L"; x: number; y: number }
  | { type: "Q"; x: number; y: number; x1: number; y1: number }
  | { type: "C"; x: number; y: number; x1: number; y1: number; x2: number; y2: number }
  | { type: "Z" };

type Point = {
  x: number;
  y: number;
};

export function compileGlyphMesh(glyph: GlyphLike, unitsPerEm: number): CompiledGlyph {
  const contours = pathCommandsToContours(glyph.getPath(0, 0, unitsPerEm).commands);
  const triangulated = triangulateContours(contours);

  return {
    advanceWidth: glyph.advanceWidth ?? unitsPerEm * 0.5,
    indices: triangulated.indices,
    vertices: triangulated.vertices,
    xMax: glyph.xMax ?? 0,
    xMin: glyph.xMin ?? 0,
    yMax: glyph.yMax ?? 0,
    yMin: glyph.yMin ?? 0
  };
}

function pathCommandsToContours(commands: PathCommand[]) {
  const contours: Point[][] = [];
  let currentContour: Point[] = [];
  let currentPoint = { x: 0, y: 0 };
  let contourStart = { x: 0, y: 0 };

  for (const command of commands) {
    if (command.type === "M") {
      closeCurrentContour();
      currentPoint = toPoint(command);
      contourStart = currentPoint;
      currentContour = [currentPoint];
      continue;
    }

    if (command.type === "L") {
      currentPoint = toPoint(command);
      currentContour.push(currentPoint);
      continue;
    }

    if (command.type === "Q") {
      const endPoint = toPoint(command);
      const controlPoint = toPoint({ x: command.x1, y: command.y1 });

      currentContour.push(...flattenQuadratic(currentPoint, controlPoint, endPoint));
      currentPoint = endPoint;
      continue;
    }

    if (command.type === "C") {
      const endPoint = toPoint(command);
      const controlPointA = toPoint({ x: command.x1, y: command.y1 });
      const controlPointB = toPoint({ x: command.x2, y: command.y2 });

      currentContour.push(...flattenCubic(currentPoint, controlPointA, controlPointB, endPoint));
      currentPoint = endPoint;
      continue;
    }

    if (command.type === "Z") {
      if (!samePoint(currentPoint, contourStart)) {
        currentContour.push(contourStart);
      }

      closeCurrentContour();
    }
  }

  closeCurrentContour();

  return contours.filter((contour) => Math.abs(signedArea(contour)) > 1e-6);

  function closeCurrentContour() {
    const cleaned = removeDuplicateClosingPoint(currentContour);

    if (cleaned.length >= 3) {
      contours.push(cleaned);
    }

    currentContour = [];
  }
}

function toPoint(command: { x: number; y: number }) {
  return {
    x: command.x,
    y: -command.y
  };
}

function flattenQuadratic(start: Point, control: Point, end: Point) {
  const points: Point[] = [];
  const steps = getCurveStepCount(start, control, end);

  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const mt = 1 - t;

    points.push({
      x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
      y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y
    });
  }

  return points;
}

function flattenCubic(start: Point, controlA: Point, controlB: Point, end: Point) {
  const points: Point[] = [];
  const steps = getCurveStepCount(start, controlA, controlB, end);

  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const mt = 1 - t;

    points.push({
      x:
        mt * mt * mt * start.x +
        3 * mt * mt * t * controlA.x +
        3 * mt * t * t * controlB.x +
        t * t * t * end.x,
      y:
        mt * mt * mt * start.y +
        3 * mt * mt * t * controlA.y +
        3 * mt * t * t * controlB.y +
        t * t * t * end.y
    });
  }

  return points;
}

function getCurveStepCount(...points: Point[]) {
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }

  return Math.max(4, Math.min(24, Math.ceil(length / 80)));
}

function triangulateContours(contours: Point[][]) {
  const classifiedContours = contours
    .map((contour, index) => ({
      area: signedArea(contour),
      contour,
      depth: getContainmentDepth(contour, contours, index)
    }))
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const outerContours = classifiedContours.filter((item) => item.depth % 2 === 0);
  const holeContours = classifiedContours.filter((item) => item.depth % 2 === 1);
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const outer of outerContours) {
    const groupContours = [ensureWinding(outer.contour, true)];
    const holes: number[] = [];

    for (const hole of holeContours) {
      if (isPointInPolygon(hole.contour[0], outer.contour)) {
        holes.push(groupContours.reduce((total, contour) => total + contour.length, 0));
        groupContours.push(ensureWinding(hole.contour, false));
      }
    }

    const groupStartIndex = vertices.length / 2;
    const groupVertices = groupContours.flatMap((contour) =>
      contour.flatMap((point) => [round(point.x), round(point.y)])
    );
    const groupIndices = earcut(groupVertices, holes, 2);

    vertices.push(...groupVertices);
    indices.push(...groupIndices.map((index) => index + groupStartIndex));
  }

  return { indices, vertices };
}

function getContainmentDepth(contour: Point[], contours: Point[][], ownIndex: number) {
  const point = contour[0];
  let depth = 0;

  for (let index = 0; index < contours.length; index += 1) {
    if (index !== ownIndex && isPointInPolygon(point, contours[index])) {
      depth += 1;
    }
  }

  return depth;
}

function ensureWinding(contour: Point[], shouldBeClockwise: boolean) {
  const isClockwise = signedArea(contour) < 0;

  return isClockwise === shouldBeClockwise ? contour : [...contour].reverse();
}

function signedArea(points: Point[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const nextPoint = points[(index + 1) % points.length];

    area += point.x * nextPoint.y - nextPoint.x * point.y;
  }

  return area / 2;
}

function isPointInPolygon(point: Point, polygon: Point[]) {
  let isInside = false;

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index++) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function removeDuplicateClosingPoint(points: Point[]) {
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) {
    return points.slice(0, -1);
  }

  return points;
}

function samePoint(a: Point, b: Point) {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
