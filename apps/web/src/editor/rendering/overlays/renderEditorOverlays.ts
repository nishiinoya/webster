import { Camera2D } from "../../geometry/Camera2D";
import {
  distance,
  getLayerCorners,
  getModelMatrix,
  getTransformHandles,
  midpoint
} from "../../geometry/TransformGeometry";
import { defaultLayerFilters, Layer } from "../../layers/Layer";
import { Scene } from "../../scene/Scene";
import { Quad } from "../geometry/Quad";
import { SelectionOverlayRenderer } from "../selection/SelectionOverlayRenderer";
import { SolidColorShaderProgram } from "../shaders/SolidColorShaderProgram";

type OverlayRendererContext = {
  quad: Quad;
  selectionOverlayRenderer: SelectionOverlayRenderer;
  solidColorShaderProgram: SolidColorShaderProgram;
  drawWorldRectangle: (rectangle: {
    height: number;
    rotation?: number;
    width: number;
    x: number;
    y: number;
  }) => void;
  drawWorldLine: (
    start: { x: number; y: number },
    end: { x: number; y: number },
    width: number
  ) => void;
};

type RenderOptions = {
  showCanvasBorder: boolean;
  showSelectionOverlay: boolean;
  showSelectionOutline: boolean;
};

/**
 * Draws editor-only overlays such as document borders, selection outlines, and handles.
 */
export function renderEditorOverlays(
  context: OverlayRendererContext,
  scene: Scene,
  camera: Camera2D,
  options: RenderOptions
) {
  const selectedLayer = scene.selectedLayerId ? scene.getLayer(scene.selectedLayerId) : null;

  if (options.showCanvasBorder) {
    drawCanvasBorder(context, scene, camera);
  }

  if (options.showSelectionOutline && selectedLayer?.visible && selectedLayer.opacity > 0) {
    drawSelectionOutline(context, selectedLayer, camera);
  }

  const selection = scene.selection.visibleSelection;

  if (options.showSelectionOverlay && selection) {
    context.selectionOverlayRenderer.render(selection, camera, scene.document);
  }
}

function drawCanvasBorder(context: OverlayRendererContext, scene: Scene, camera: Camera2D) {
  const document = scene.document;
  const left = document.x;
  const right = document.x + document.width;
  const bottom = document.y;
  const top = document.y + document.height;
  const glowWidth = Math.max(8 / camera.zoom, 1.4);
  const midWidth = Math.max(4 / camera.zoom, 0.9);
  const crispWidth = Math.max(1.5 / camera.zoom, 0.5);

  context.solidColorShaderProgram.use();
  context.solidColorShaderProgram.setProjection(camera.projectionMatrix);
  context.solidColorShaderProgram.setFilters(defaultLayerFilters);
  context.solidColorShaderProgram.setAdjustmentFilters([]);

  context.solidColorShaderProgram.setColor([0.22, 1, 0.82, 0.1]);
  drawDocumentBorderLines(context, left, right, bottom, top, glowWidth);

  context.solidColorShaderProgram.setColor([0.3, 0.95, 0.82, 0.24]);
  drawDocumentBorderLines(context, left, right, bottom, top, midWidth);

  context.solidColorShaderProgram.setColor([0.64, 1, 0.9, 0.86]);
  drawDocumentBorderLines(context, left, right, bottom, top, crispWidth);
}

function drawDocumentBorderLines(
  context: OverlayRendererContext,
  left: number,
  right: number,
  bottom: number,
  top: number,
  width: number
) {
  context.drawWorldLine({ x: left, y: bottom }, { x: right, y: bottom }, width);
  context.drawWorldLine({ x: right, y: bottom }, { x: right, y: top }, width);
  context.drawWorldLine({ x: right, y: top }, { x: left, y: top }, width);
  context.drawWorldLine({ x: left, y: top }, { x: left, y: bottom }, width);
}

function drawSelectionOutline(
  context: OverlayRendererContext,
  layer: Layer,
  camera: Camera2D
) {
  const corners = getLayerCorners(layer);
  const outlineWidth = Math.max(1.5 / camera.zoom, 0.5);

  context.solidColorShaderProgram.use();
  context.solidColorShaderProgram.setProjection(camera.projectionMatrix);
  context.solidColorShaderProgram.setFilters(defaultLayerFilters);
  context.solidColorShaderProgram.setAdjustmentFilters([]);
  context.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);

  context.drawWorldLine(corners.bottomLeft, corners.bottomRight, outlineWidth);
  context.drawWorldLine(corners.bottomRight, corners.topRight, outlineWidth);
  context.drawWorldLine(corners.topRight, corners.topLeft, outlineWidth);
  context.drawWorldLine(corners.topLeft, corners.bottomLeft, outlineWidth);

  if (!layer.locked) {
    drawTransformHandles(context, layer, camera);
  }
}

function drawTransformHandles(
  context: OverlayRendererContext,
  layer: Layer,
  camera: Camera2D
) {
  const handleSize = 10 / camera.zoom;
  const rotationHandleSize = 12 / camera.zoom;
  const corners = getLayerCorners(layer);
  const topCenter = midpoint(corners.topLeft, corners.topRight);
  const handles = getTransformHandles(layer, camera);
  const rotationHandle = handles.find((handle) => handle.id === "rotate");

  if (rotationHandle) {
    context.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 0.8]);
    context.drawWorldLine(topCenter, rotationHandle, Math.max(1 / camera.zoom, 0.4));
  }

  for (const handle of handles) {
    const size = handle.id === "rotate" ? rotationHandleSize : handleSize;
    const borderWidth = Math.max(1 / camera.zoom, 0.4);

    context.solidColorShaderProgram.setColor(
      handle.id === "rotate" ? [0.94, 0.78, 0.36, 1] : [0.07, 0.08, 0.09, 1]
    );
    context.solidColorShaderProgram.setModel(
      getModelMatrix({
        x: handle.x - size / 2,
        y: handle.y - size / 2,
        width: size,
        height: size
      })
    );
    context.quad.draw(context.solidColorShaderProgram);

    context.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);
    context.drawWorldRectangle({
      x: handle.x - size / 2,
      y: handle.y - size / 2,
      width: size,
      height: borderWidth
    });
    context.drawWorldRectangle({
      x: handle.x - size / 2,
      y: handle.y + size / 2 - borderWidth,
      width: size,
      height: borderWidth
    });
    context.drawWorldRectangle({
      x: handle.x - size / 2,
      y: handle.y - size / 2,
      width: borderWidth,
      height: size
    });
    context.drawWorldRectangle({
      x: handle.x + size / 2 - borderWidth,
      y: handle.y - size / 2,
      width: borderWidth,
      height: size
    });
  }
}

/**
 * Draws a world-space line by delegating to the shared rectangle primitive.
 */
export function drawWorldLine(
  drawWorldRectangleFn: OverlayRendererContext["drawWorldRectangle"],
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number
) {
  const center = midpoint(start, end);
  const length = distance(start, end);
  const rotation = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;

  drawWorldRectangleFn({
    x: center.x - length / 2,
    y: center.y - width / 2,
    width: length,
    height: width,
    rotation
  });
}
