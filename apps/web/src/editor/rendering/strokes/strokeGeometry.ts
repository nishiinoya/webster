import type { StrokePath, StrokeStyle } from "../../layers/StrokeLayer";
import { StrokeLayer } from "../../layers/StrokeLayer";

type StrokeMeshVertex = {
  x: number;
  y: number;
  u: number;
  v: number;
};

export type CachedStrokePathGeometry = {
  brushSize: number;
  brushStyle: number;
  color: [number, number, number, number];
  selectionClip: StrokePath["selectionClip"] | null;
  texCoords: Float32Array;
  vertices: Float32Array;
};

/**
 * Builds cached mesh data for a stroke path in the owning layer's local space.
 */
export function buildStrokePathGeometry(
  layer: StrokeLayer,
  path: StrokePath
): CachedStrokePathGeometry {
  const width = getRenderedStrokeWidth(path.strokeStyle, path.strokeWidth);
  const points = simplifyStrokePoints(path.points, Math.max(0.75, width * 0.08));

  const meshVertices =
    points.length === 1
      ? getSinglePointStrokeGeometry(path.strokeStyle, points[0], width / 2)
      : [
          ...getPolylineStrokeGeometry(points, width),
          ...getStrokeCaps(path.strokeStyle, points, width / 2, width)
        ];

  const vertices = new Float32Array(meshVertices.length * 2);
  const texCoords = new Float32Array(meshVertices.length * 2);

  for (let index = 0; index < meshVertices.length; index += 1) {
    const point = meshVertices[index];
    const vertexIndex = index * 2;

    vertices[vertexIndex] = point.x / Math.max(1e-6, layer.width);
    vertices[vertexIndex + 1] = point.y / Math.max(1e-6, layer.height);

    texCoords[vertexIndex] = point.u;
    texCoords[vertexIndex + 1] = point.v;
  }

  return {
    brushSize: path.strokeWidth,
    brushStyle: getBrushStyleUniform(path.strokeStyle),
    color: getRenderedStrokeColor(path.strokeStyle, path.color),
    selectionClip: path.selectionClip ?? null,
    texCoords,
    vertices
  };
}

function getBrushStyleUniform(style: StrokeStyle) {
  if (style === "pencil") {
    return 1;
  }

  if (style === "brush") {
    return 2;
  }

  if (style === "marker") {
    return 3;
  }

  if (style === "highlighter") {
    return 4;
  }

  return 0;
}

function simplifyStrokePoints(points: Array<{ x: number; y: number }>, minDistance: number) {
  if (points.length <= 2) {
    return points;
  }

  const simplified = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const point = points[index];

    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= minDistance) {
      simplified.push(point);
    }
  }

  simplified.push(points[points.length - 1]);

  return simplified;
}

function getRenderedStrokeWidth(style: StrokeStyle, width: number) {
  if (style === "pencil") {
    return width * 0.62;
  }

  if (style === "marker") {
    return width * 0.9;
  }

  if (style === "highlighter") {
    return width * 1.1;
  }

  if (style === "brush") {
    return width * 1.05;
  }

  return width;
}

function getRenderedStrokeColor(
  style: StrokeStyle,
  color: [number, number, number, number]
): [number, number, number, number] {
  if (style === "pencil") {
    return [color[0], color[1], color[2], color[3] * 0.88];
  }

  if (style === "highlighter") {
    return [color[0], color[1], color[2], color[3] * 0.52];
  }

  if (style === "marker") {
    return [color[0], color[1], color[2], color[3] * 0.94];
  }

  return color;
}

function getPolylineStrokeGeometry(points: Array<{ x: number; y: number }>, width: number) {
  if (points.length < 2) {
    return [];
  }

  const halfWidth = width / 2;
  const widthScale = Math.max(width, 1e-6);
  const segmentNormals: Array<{ x: number; y: number }> = [];
  const distances = getPathLengths(points);

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    segmentNormals.push(
      length <= 1e-6
        ? { x: 0, y: 1 }
        : {
            x: -dy / length,
            y: dx / length
          }
    );
  }

  const left: StrokeMeshVertex[] = [];
  const right: StrokeMeshVertex[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const previousNormal = segmentNormals[Math.max(0, index - 1)];
    const nextNormal = segmentNormals[Math.min(segmentNormals.length - 1, index)];
    const normal =
      index === 0
        ? nextNormal
        : index === points.length - 1
          ? previousNormal
          : getJoinNormal(previousNormal, nextNormal);

    const miterScale =
      index === 0 || index === points.length - 1
        ? 1
        : Math.min(1.8, Math.max(1, 1 / Math.max(0.45, Math.abs(dot(normal, nextNormal)))));

    const point = points[index];
    const u = distances[index] / widthScale;
    const offsetX = normal.x * halfWidth * miterScale;
    const offsetY = normal.y * halfWidth * miterScale;

    left.push({
      x: point.x + offsetX,
      y: point.y + offsetY,
      u,
      v: 0
    });

    right.push({
      x: point.x - offsetX,
      y: point.y - offsetY,
      u,
      v: 1
    });
  }

  const triangles: StrokeMeshVertex[] = [];

  for (let index = 1; index < points.length; index += 1) {
    triangles.push(left[index - 1], left[index], right[index - 1]);
    triangles.push(right[index - 1], left[index], right[index]);
  }

  return triangles;
}

function getSinglePointStrokeGeometry(
  style: StrokeStyle,
  center: { x: number; y: number },
  radius: number
) {
  const width = radius * 2;
  const halfSegment = Math.max(0.01, radius * 0.35);

  const pseudoPoints = [
    { x: center.x - halfSegment, y: center.y },
    { x: center.x + halfSegment, y: center.y }
  ];

  if (style === "marker" || style === "highlighter") {
    return getPolylineStrokeGeometry(pseudoPoints, width);
  }

  return [
    ...getPolylineStrokeGeometry(pseudoPoints, width),
    ...getStrokeCaps(style, pseudoPoints, radius, width)
  ];
}

function getStrokeCaps(
  style: StrokeStyle,
  points: Array<{ x: number; y: number }>,
  radius: number,
  strokeWidth = radius * 2
) {
  if (style === "marker" || style === "highlighter") {
    return [];
  }

  const start = points[0];
  const next = points[1];
  const end = points[points.length - 1];
  const previous = points[points.length - 2];
  const totalLength = getPathLength(points);
  const endU = totalLength / Math.max(strokeWidth, 1e-6);

  if (style === "pencil" || style === "brush") {
    return [
      ...getLocalTaperCap(start, next, radius, 0, strokeWidth),
      ...getLocalTaperCap(end, previous, radius, endU, strokeWidth)
    ];
  }

  return [
    ...getLocalRoundCap(start, next, radius, 0, strokeWidth),
    ...getLocalRoundCap(end, previous, radius, endU, strokeWidth)
  ];
}

function getLocalRoundCap(
  center: { x: number; y: number },
  neighbor: { x: number; y: number },
  radius: number,
  centerU: number,
  strokeWidth: number
) {
  const dx = center.x - neighbor.x;
  const dy = center.y - neighbor.y;
  const length = Math.hypot(dx, dy);

  if (length <= 1e-6) {
    return [];
  }

  const outwardDirection = { x: dx / length, y: dy / length };

  return getLocalSemicirclePoints(center, outwardDirection, radius, centerU, strokeWidth);
}

function getLocalTaperCap(
  center: { x: number; y: number },
  neighbor: { x: number; y: number },
  radius: number,
  centerU: number,
  strokeWidth: number
) {
  const dx = center.x - neighbor.x;
  const dy = center.y - neighbor.y;
  const length = Math.hypot(dx, dy);

  if (length <= 1e-6) {
    return [];
  }

  const tangent = { x: dx / length, y: dy / length };
  const normal = { x: -tangent.y, y: tangent.x };
  const tipDistance = radius * 0.75;

  const left = {
    x: center.x + normal.x * radius,
    y: center.y + normal.y * radius
  };

  const right = {
    x: center.x - normal.x * radius,
    y: center.y - normal.y * radius
  };

  const tip = {
    x: center.x + tangent.x * tipDistance,
    y: center.y + tangent.y * tipDistance
  };

  return [
    mapStrokeCapVertex(center, center, tangent, normal, centerU, strokeWidth),
    mapStrokeCapVertex(left, center, tangent, normal, centerU, strokeWidth),
    mapStrokeCapVertex(tip, center, tangent, normal, centerU, strokeWidth),

    mapStrokeCapVertex(center, center, tangent, normal, centerU, strokeWidth),
    mapStrokeCapVertex(tip, center, tangent, normal, centerU, strokeWidth),
    mapStrokeCapVertex(right, center, tangent, normal, centerU, strokeWidth)
  ];
}

function getLocalSemicirclePoints(
  center: { x: number; y: number },
  outwardDirection: { x: number; y: number },
  radius: number,
  centerU: number,
  strokeWidth: number
) {
  const points: StrokeMeshVertex[] = [];
  const segments = 10;
  const tangent = outwardDirection;
  const normal = { x: -tangent.y, y: tangent.x };
  const angle = Math.atan2(outwardDirection.y, outwardDirection.x);
  const startAngle = angle - Math.PI / 2;

  for (let index = 0; index < segments; index += 1) {
    const a0 = startAngle + (index / segments) * Math.PI;
    const a1 = startAngle + ((index + 1) / segments) * Math.PI;

    const p0 = {
      x: center.x + Math.cos(a0) * radius,
      y: center.y + Math.sin(a0) * radius
    };

    const p1 = {
      x: center.x + Math.cos(a1) * radius,
      y: center.y + Math.sin(a1) * radius
    };

    points.push(
      mapStrokeCapVertex(center, center, tangent, normal, centerU, strokeWidth),
      mapStrokeCapVertex(p0, center, tangent, normal, centerU, strokeWidth),
      mapStrokeCapVertex(p1, center, tangent, normal, centerU, strokeWidth)
    );
  }

  return points;
}

function getJoinNormal(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = a.x + b.x;
  const y = a.y + b.y;
  const length = Math.hypot(x, y);

  if (length <= 1e-6) {
    return b;
  }

  return {
    x: x / length,
    y: y / length
  };
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x * b.x + a.y * b.y;
}

function getPathLengths(points: Array<{ x: number; y: number }>) {
  const distances = [0];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    distances.push(distances[index - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
  }

  return distances;
}

function getPathLength(points: Array<{ x: number; y: number }>) {
  const distances = getPathLengths(points);
  return distances[distances.length - 1] ?? 0;
}

function mapStrokeCapVertex(
  point: { x: number; y: number },
  center: { x: number; y: number },
  tangent: { x: number; y: number },
  normal: { x: number; y: number },
  centerU: number,
  strokeWidth: number
): StrokeMeshVertex {
  const offsetX = point.x - center.x;
  const offsetY = point.y - center.y;
  const alongOffset = offsetX * tangent.x + offsetY * tangent.y;
  const acrossOffset = offsetX * normal.x + offsetY * normal.y;
  const widthScale = Math.max(strokeWidth, 1e-6);

  return {
    x: point.x,
    y: point.y,
    u: centerU + alongOffset / widthScale,
    v: Math.max(0, Math.min(1, 0.5 + acrossOffset / widthScale))
  };
}
