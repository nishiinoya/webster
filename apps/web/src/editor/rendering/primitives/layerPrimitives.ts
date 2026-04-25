import earcut from "earcut";

import { getModelMatrix } from "../../geometry/TransformGeometry";
import { Layer } from "../../layers/Layer";
import { BrushShaderProgram } from "../shaders/BrushShaderProgram";
import { SolidColorShaderProgram } from "../shaders/SolidColorShaderProgram";
import type { BitmapTextRect } from "../text/BitmapText";

type Rectangle = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type PrimitiveRendererContext = {
  gl: WebGLRenderingContext;
  brushShaderProgram: BrushShaderProgram;
  solidColorShaderProgram: SolidColorShaderProgram;
  localRectanglePositionBuffer: WebGLBuffer;
  localRectangleTexCoordBuffer: WebGLBuffer;
  getLayerModelMatrix: (layer: Layer) => Float32Array;
};

/**
 * Draws a clipped local-space rectangle for a layer using the solid color pipeline.
 */
export function drawLayerLocalRectangle(
  context: PrimitiveRendererContext,
  layer: Layer,
  rectangle: Rectangle,
  maskFrame?: BitmapTextRect
) {
  const clippedLeft = Math.max(0, rectangle.x);
  const clippedBottom = Math.max(0, rectangle.y);
  const clippedRight = Math.min(layer.width, rectangle.x + rectangle.width);
  const clippedTop = Math.min(layer.height, rectangle.y + rectangle.height);

  if (clippedRight <= clippedLeft || clippedTop <= clippedBottom) {
    return;
  }

  const x0 = clippedLeft / layer.width;
  const y0 = clippedBottom / layer.height;
  const x1 = clippedRight / layer.width;
  const y1 = clippedTop / layer.height;
  const vertices = new Float32Array([x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1]);
  const texCoordFrame = maskFrame ?? {
    x: 0,
    y: 0,
    width: layer.width,
    height: layer.height
  };
  const u0 = (clippedLeft - texCoordFrame.x) / texCoordFrame.width;
  const v0 = (clippedBottom - texCoordFrame.y) / texCoordFrame.height;
  const u1 = (clippedRight - texCoordFrame.x) / texCoordFrame.width;
  const v1 = (clippedTop - texCoordFrame.y) / texCoordFrame.height;
  const texCoords = new Float32Array([u0, v0, u1, v0, u0, v1, u0, v1, u1, v0, u1, v1]);

  context.solidColorShaderProgram.setModel(context.getLayerModelMatrix(layer));

  context.gl.bindBuffer(context.gl.ARRAY_BUFFER, context.localRectanglePositionBuffer);
  context.gl.bufferData(context.gl.ARRAY_BUFFER, vertices, context.gl.DYNAMIC_DRAW);
  context.gl.enableVertexAttribArray(context.solidColorShaderProgram.positionAttributeLocation);
  context.gl.vertexAttribPointer(
    context.solidColorShaderProgram.positionAttributeLocation,
    2,
    context.gl.FLOAT,
    false,
    0,
    0
  );

  context.gl.bindBuffer(context.gl.ARRAY_BUFFER, context.localRectangleTexCoordBuffer);
  context.gl.bufferData(context.gl.ARRAY_BUFFER, texCoords, context.gl.DYNAMIC_DRAW);
  context.gl.enableVertexAttribArray(context.solidColorShaderProgram.texCoordAttributeLocation);
  context.gl.vertexAttribPointer(
    context.solidColorShaderProgram.texCoordAttributeLocation,
    2,
    context.gl.FLOAT,
    false,
    0,
    0
  );

  context.gl.drawArrays(context.gl.TRIANGLES, 0, 6);
}

/**
 * Tessellates and draws a local-space polygon for a layer.
 */
export function drawLayerLocalPolygon(
  context: PrimitiveRendererContext,
  layer: Layer,
  points: Array<{ x: number; y: number }>
) {
  const flatPoints = points.flatMap((point) => [point.x, point.y]);
  const indices = earcut(flatPoints, undefined, 2);

  drawLayerLocalTriangles(
    context,
    layer,
    indices.map((index) => points[index])
  );
}

/**
 * Draws a thick local-space line segment for a layer.
 */
export function drawLayerLocalLine(
  context: PrimitiveRendererContext,
  layer: Layer,
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  if (length <= 1e-6) {
    return;
  }

  const normalX = (-dy / length) * (width / 2);
  const normalY = (dx / length) * (width / 2);
  const a = { x: start.x + normalX, y: start.y + normalY };
  const b = { x: end.x + normalX, y: end.y + normalY };
  const c = { x: end.x - normalX, y: end.y - normalY };
  const d = { x: start.x - normalX, y: start.y - normalY };

  drawLayerLocalTriangles(context, layer, [a, b, d, d, b, c]);
}

/**
 * Draws a circle approximation in layer-local space.
 */
export function drawLayerLocalCircle(
  context: PrimitiveRendererContext,
  layer: Layer,
  center: { x: number; y: number },
  radius: number
) {
  const points: Array<{ x: number; y: number }> = [];
  const segments = 18;

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;

    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    });
  }

  drawLayerLocalPolygon(context, layer, points);
}

/**
 * Draws raw local-space triangle points using the solid color shader.
 */
export function drawLayerLocalTriangles(
  context: PrimitiveRendererContext,
  layer: Layer,
  points: Array<{ x: number; y: number }>
) {
  if (points.length === 0) {
    return;
  }

  const vertices = new Float32Array(points.length * 2);
  const texCoords = new Float32Array(points.length * 2);

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const vertexIndex = index * 2;

    vertices[vertexIndex] = point.x / layer.width;
    vertices[vertexIndex + 1] = point.y / layer.height;
    texCoords[vertexIndex] = point.x / layer.width;
    texCoords[vertexIndex + 1] = point.y / layer.height;
  }

  drawLayerLocalVertexData(context, layer, vertices, texCoords);
}

/**
 * Uploads arbitrary local-space vertex data for the solid color shader.
 */
export function drawLayerLocalVertexData(
  context: PrimitiveRendererContext,
  layer: Layer,
  vertices: Float32Array,
  texCoords: Float32Array
) {
  if (vertices.length === 0) {
    return;
  }

  context.solidColorShaderProgram.setModel(context.getLayerModelMatrix(layer));

  context.gl.bindBuffer(context.gl.ARRAY_BUFFER, context.localRectanglePositionBuffer);
  context.gl.bufferData(context.gl.ARRAY_BUFFER, vertices, context.gl.DYNAMIC_DRAW);
  context.gl.enableVertexAttribArray(context.solidColorShaderProgram.positionAttributeLocation);
  context.gl.vertexAttribPointer(
    context.solidColorShaderProgram.positionAttributeLocation,
    2,
    context.gl.FLOAT,
    false,
    0,
    0
  );

  context.gl.bindBuffer(context.gl.ARRAY_BUFFER, context.localRectangleTexCoordBuffer);
  context.gl.bufferData(context.gl.ARRAY_BUFFER, texCoords, context.gl.DYNAMIC_DRAW);
  context.gl.enableVertexAttribArray(context.solidColorShaderProgram.texCoordAttributeLocation);
  context.gl.vertexAttribPointer(
    context.solidColorShaderProgram.texCoordAttributeLocation,
    2,
    context.gl.FLOAT,
    false,
    0,
    0
  );

  context.gl.drawArrays(context.gl.TRIANGLES, 0, vertices.length / 2);
}

/**
 * Uploads arbitrary local-space vertex data for the brush shader.
 */
export function drawBrushLayerLocalVertexData(
  context: PrimitiveRendererContext,
  layer: Layer,
  vertices: Float32Array,
  texCoords: Float32Array
) {
  if (vertices.length === 0) {
    return;
  }

  context.brushShaderProgram.setModel(context.getLayerModelMatrix(layer));

  context.gl.bindBuffer(context.gl.ARRAY_BUFFER, context.localRectanglePositionBuffer);
  context.gl.bufferData(context.gl.ARRAY_BUFFER, vertices, context.gl.DYNAMIC_DRAW);
  context.gl.enableVertexAttribArray(context.brushShaderProgram.positionAttributeLocation);
  context.gl.vertexAttribPointer(
    context.brushShaderProgram.positionAttributeLocation,
    2,
    context.gl.FLOAT,
    false,
    0,
    0
  );

  context.gl.bindBuffer(context.gl.ARRAY_BUFFER, context.localRectangleTexCoordBuffer);
  context.gl.bufferData(context.gl.ARRAY_BUFFER, texCoords, context.gl.DYNAMIC_DRAW);
  context.gl.enableVertexAttribArray(context.brushShaderProgram.texCoordAttributeLocation);
  context.gl.vertexAttribPointer(
    context.brushShaderProgram.texCoordAttributeLocation,
    2,
    context.gl.FLOAT,
    false,
    0,
    0
  );

  context.gl.drawArrays(context.gl.TRIANGLES, 0, vertices.length / 2);
}

/**
 * Configures the model matrix for a world-space rectangle draw.
 */
export function drawWorldRectangle(
  context: Pick<PrimitiveRendererContext, "solidColorShaderProgram">,
  rectangle: {
    height: number;
    rotation?: number;
    width: number;
    x: number;
    y: number;
  }
) {
  context.solidColorShaderProgram.setModel(getModelMatrix(rectangle));
  context.solidColorShaderProgram.setMaskEnabled(false);
  context.solidColorShaderProgram.setMaskTextureUnit(1);
}
