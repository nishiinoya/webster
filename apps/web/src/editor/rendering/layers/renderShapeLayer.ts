import { Camera2D } from "../../geometry/Camera2D";
import { defaultLayerFilters, Layer } from "../../layers/Layer";
import { ShapeLayer } from "../../layers/ShapeLayer";
import { EllipseMesh } from "../geometry/EllipseMesh";
import type { EffectiveLayerFilters } from "../filters/layerFilters";
import { getPolygonShapePoints } from "../renderingHelpers";
import { Quad } from "../geometry/Quad";
import { SolidColorShaderProgram } from "../shaders/SolidColorShaderProgram";
import type { BitmapTextRect } from "../text/BitmapText";

type MaskShaderProgram = {
  setMaskEnabled(enabled: boolean): void;
  setMaskTextureUnit(unit: number): void;
};

type ShapeLayerRendererContext = {
  ellipseMesh: EllipseMesh;
  quad: Quad;
  solidColorShaderProgram: SolidColorShaderProgram;
  bindMask: (layer: Layer, shaderProgram: MaskShaderProgram) => void;
  drawLayerLocalLine: (
    layer: Layer,
    start: { x: number; y: number },
    end: { x: number; y: number },
    width: number
  ) => void;
  drawLayerLocalPolygon: (layer: Layer, points: Array<{ x: number; y: number }>) => void;
  drawLayerLocalRectangle: (
    layer: Layer,
    rectangle: { height: number; width: number; x: number; y: number },
    maskFrame?: BitmapTextRect
  ) => void;
  getLayerModelMatrix: (layer: Layer) => Float32Array;
  getRenderColor: (
    color: [number, number, number, number],
    opacity: number
  ) => [number, number, number, number];
};

/**
 * Draws a shape layer using the appropriate primitive path for its shape kind.
 */
export function renderShapeLayer(
  context: ShapeLayerRendererContext,
  layer: ShapeLayer,
  camera: Camera2D,
  filters: EffectiveLayerFilters
) {
  context.solidColorShaderProgram.use();
  context.solidColorShaderProgram.setProjection(camera.projectionMatrix);
  context.solidColorShaderProgram.setFilters(filters.filters);
  context.solidColorShaderProgram.setAdjustmentFilters(filters.adjustments);

  if (layer.shape === "rectangle") {
    drawRectangleShape(context, layer);
    return;
  }

  if (layer.shape === "circle") {
    drawEllipseShape(context, layer);
    return;
  }

  if (layer.shape === "line") {
    drawLineShape(context, layer);
    return;
  }

  drawPolygonShape(context, layer);
}

function drawPolygonShape(context: ShapeLayerRendererContext, layer: ShapeLayer) {
  const points = getPolygonShapePoints(layer);

  if (points.length < 3) {
    return;
  }

  if (layer.fillColor[3] > 0) {
    context.solidColorShaderProgram.setColor(context.getRenderColor(layer.fillColor, layer.opacity));
    context.bindMask(layer, context.solidColorShaderProgram);
    context.drawLayerLocalPolygon(layer, points);
  }

  if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
    return;
  }

  context.solidColorShaderProgram.setColor(context.getRenderColor(layer.strokeColor, layer.opacity));
  context.bindMask(layer, context.solidColorShaderProgram);

  const strokeWidth =
    layer.strokeWidth / Math.max(1e-6, (Math.abs(layer.scaleX) + Math.abs(layer.scaleY)) / 2);

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];

    context.drawLayerLocalLine(layer, start, end, strokeWidth);
  }
}

function drawRectangleShape(context: ShapeLayerRendererContext, layer: ShapeLayer) {
  if (layer.fillColor[3] > 0) {
    context.solidColorShaderProgram.setColor(context.getRenderColor(layer.fillColor, layer.opacity));
    context.solidColorShaderProgram.setModel(context.getLayerModelMatrix(layer));
    context.bindMask(layer, context.solidColorShaderProgram);
    context.quad.drawTextured(context.solidColorShaderProgram);
  }

  if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
    return;
  }

  context.solidColorShaderProgram.setColor(context.getRenderColor(layer.strokeColor, layer.opacity));
  context.bindMask(layer, context.solidColorShaderProgram);

  const strokeWidthX = Math.min(
    layer.strokeWidth / Math.max(layer.scaleX, 1e-6),
    layer.width / 2
  );
  const strokeWidthY = Math.min(
    layer.strokeWidth / Math.max(layer.scaleY, 1e-6),
    layer.height / 2
  );

  context.drawLayerLocalRectangle(layer, {
    x: 0,
    y: 0,
    width: layer.width,
    height: strokeWidthY
  });

  context.drawLayerLocalRectangle(layer, {
    x: 0,
    y: layer.height - strokeWidthY,
    width: layer.width,
    height: strokeWidthY
  });

  context.drawLayerLocalRectangle(layer, {
    x: 0,
    y: 0,
    width: strokeWidthX,
    height: layer.height
  });

  context.drawLayerLocalRectangle(layer, {
    x: layer.width - strokeWidthX,
    y: 0,
    width: strokeWidthX,
    height: layer.height
  });
}

function drawLineShape(context: ShapeLayerRendererContext, layer: ShapeLayer) {
  if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
    return;
  }

  const strokeWidth = Math.min(
    Math.max(1, layer.strokeWidth) / Math.max(layer.scaleY, 1e-6),
    layer.height
  );

  context.solidColorShaderProgram.setColor(context.getRenderColor(layer.strokeColor, layer.opacity));
  context.bindMask(layer, context.solidColorShaderProgram);

  context.drawLayerLocalRectangle(layer, {
    x: 0,
    y: (layer.height - strokeWidth) / 2,
    width: layer.width,
    height: strokeWidth
  });
}

function drawEllipseShape(context: ShapeLayerRendererContext, layer: ShapeLayer) {
  if (layer.fillColor[3] > 0) {
    context.solidColorShaderProgram.setColor(context.getRenderColor(layer.fillColor, layer.opacity));
    context.solidColorShaderProgram.setModel(context.getLayerModelMatrix(layer));
    context.bindMask(layer, context.solidColorShaderProgram);
    context.ellipseMesh.drawFill(context.solidColorShaderProgram);
  }

  if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
    return;
  }

  context.solidColorShaderProgram.setColor(context.getRenderColor(layer.strokeColor, layer.opacity));
  context.solidColorShaderProgram.setModel(context.getLayerModelMatrix(layer));
  context.bindMask(layer, context.solidColorShaderProgram);
  context.ellipseMesh.drawStroke(
    context.solidColorShaderProgram,
    Math.max(1, layer.strokeWidth),
    layer.width * layer.scaleX,
    layer.height * layer.scaleY
  );
}
