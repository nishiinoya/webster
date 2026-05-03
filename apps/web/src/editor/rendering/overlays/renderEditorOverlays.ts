import { Camera2D } from "../../geometry/Camera2D";
import {
  distance,
  getLayerCorners,
  getLayerFrameCorners,
  getModelMatrix,
  getTransformHandles,
  midpoint
} from "../../geometry/TransformGeometry";
import { defaultLayerFilters, Layer } from "../../layers/Layer";
import { GroupLayer } from "../../layers/GroupLayer";
import { ImageLayer } from "../../layers/ImageLayer";
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
  showImageWarpControls: boolean;
  showRotationHandle: boolean;
  showSelectionOverlay: boolean;
  showSelectionOutline: boolean;
  showTransformHandles: boolean;
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
  const selectedLayer =
    scene.selectedLayerIds.length === 1 && scene.selectedLayerId
      ? scene.getLayer(scene.selectedLayerId)
      : null;

  if (options.showCanvasBorder) {
    drawCanvasBorder(context, scene, camera);
  }

  if (options.showSelectionOutline && selectedLayer?.visible && selectedLayer.opacity > 0) {
    drawSelectionOutline(
      context,
      selectedLayer,
      camera,
      options.showImageWarpControls,
      options.showTransformHandles,
      options.showRotationHandle
    );
  }

  if (options.showSelectionOverlay) {
    const currentSelection = scene.selection.current
      ? {
          ...scene.selection.current,
          isDraft: false
        }
      : null;
    const draftSelection = scene.selection.draft
      ? {
          ...scene.selection.draft,
          inverted: false,
          isDraft: true
        }
      : null;

    if (currentSelection) {
      context.selectionOverlayRenderer.render(currentSelection, camera, scene.document, {
        showDim: !draftSelection
      });
    }

    if (draftSelection) {
      context.selectionOverlayRenderer.render(draftSelection, camera, scene.document);
    }
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
  camera: Camera2D,
  showImageWarpControls: boolean,
  showTransformHandles: boolean,
  showRotationHandle: boolean
) {
  const frameCorners = getLayerFrameCorners(layer);
  const warpCorners = getLayerCorners(layer);
  const outlineWidth = Math.max(1.5 / camera.zoom, 0.5);

  context.solidColorShaderProgram.use();
  context.solidColorShaderProgram.setProjection(camera.projectionMatrix);
  context.solidColorShaderProgram.setFilters(defaultLayerFilters);
  context.solidColorShaderProgram.setAdjustmentFilters([]);
  context.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);
  drawCornerOutline(context, frameCorners, outlineWidth);

  if (showTransformHandles && !layer.locked && !(layer instanceof GroupLayer)) {
    if (showImageWarpControls && layer instanceof ImageLayer) {
      context.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 0.35]);
      drawCornerOutline(context, warpCorners, Math.max(5 / camera.zoom, 1.2));

      context.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);
      drawCornerOutline(context, warpCorners, outlineWidth);
      drawImageWarpCornerDots(context, warpCorners, camera);
    } else if (!areCornerSetsEqual(warpCorners, frameCorners)) {
      context.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 0.38]);
      drawCornerOutline(context, frameCorners, Math.max(1 / camera.zoom, 0.4));
    }

    drawTransformHandles(context, layer, camera, showRotationHandle);
  }
}

function drawCornerOutline(
  context: OverlayRendererContext,
  corners: ReturnType<typeof getLayerCorners>,
  width: number
) {
  context.drawWorldLine(corners.bottomLeft, corners.bottomRight, width);
  context.drawWorldLine(corners.bottomRight, corners.topRight, width);
  context.drawWorldLine(corners.topRight, corners.topLeft, width);
  context.drawWorldLine(corners.topLeft, corners.bottomLeft, width);
}

function areCornerSetsEqual(
  left: ReturnType<typeof getLayerCorners>,
  right: ReturnType<typeof getLayerCorners>
) {
  return (
    arePointsClose(left.bottomLeft, right.bottomLeft) &&
    arePointsClose(left.bottomRight, right.bottomRight) &&
    arePointsClose(left.topLeft, right.topLeft) &&
    arePointsClose(left.topRight, right.topRight)
  );
}

function arePointsClose(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.abs(left.x - right.x) < 1e-6 && Math.abs(left.y - right.y) < 1e-6;
}

function drawImageWarpCornerDots(
  context: OverlayRendererContext,
  corners: ReturnType<typeof getLayerCorners>,
  camera: Camera2D
) {
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  const glowSize = 22 / camera.zoom;
  const midSize = 14 / camera.zoom;
  const coreSize = 7 / camera.zoom;

  for (const point of points) {
    context.solidColorShaderProgram.setColor([0.29, 1, 0.84, 0.16]);
    drawPointSquare(context, point, glowSize);

    context.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 0.48]);
    drawPointSquare(context, point, midSize);

    context.solidColorShaderProgram.setColor([0.96, 0.84, 0.38, 1]);
    drawPointSquare(context, point, coreSize);
  }
}

function drawPointSquare(
  context: OverlayRendererContext,
  point: { x: number; y: number },
  size: number
) {
  context.drawWorldRectangle({
    height: size,
    width: size,
    x: point.x - size / 2,
    y: point.y - size / 2
  });
}

function drawTransformHandles(
  context: OverlayRendererContext,
  layer: Layer,
  camera: Camera2D,
  showRotationHandle: boolean
) {
  const handleSize = 10 / camera.zoom;
  const rotationHandleSize = 12 / camera.zoom;
  const corners = getLayerFrameCorners(layer);
  const topCenter = midpoint(corners.topLeft, corners.topRight);
  const handles = getTransformHandles(layer, camera).filter(
    (handle) => showRotationHandle || handle.id !== "rotate"
  );
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
