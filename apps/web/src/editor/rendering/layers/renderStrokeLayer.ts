import { Camera2D } from "../../geometry/Camera2D";
import { Layer } from "../../layers/Layer";
import { StrokeLayer } from "../../layers/StrokeLayer";
import type { EffectiveLayerFilters } from "../filters/layerFilters";
import { getLayerSelectionClip } from "../renderingHelpers";
import type { CachedStrokePathGeometry } from "../strokes/strokeGeometry";
import { BrushShaderProgram } from "../shaders/BrushShaderProgram";

type MaskShaderProgram = {
  setMaskEnabled(enabled: boolean): void;
  setMaskTextureUnit(unit: number): void;
};

type StrokeLayerRendererContext = {
  brushShaderProgram: BrushShaderProgram;
  bindMask: (layer: Layer, shaderProgram: MaskShaderProgram) => void;
  drawBrushLayerLocalVertexData: (
    layer: Layer,
    vertices: Float32Array,
    texCoords: Float32Array
  ) => void;
  getRenderColor: (
    color: [number, number, number, number],
    opacity: number
  ) => [number, number, number, number];
  getStrokeGeometry: (layer: StrokeLayer) => { paths: CachedStrokePathGeometry[] };
};

/**
 * Draws a stroke layer from cached stroke geometry and selection clips.
 */
export function renderStrokeLayer(
  context: StrokeLayerRendererContext,
  layer: StrokeLayer,
  camera: Camera2D,
  filters: EffectiveLayerFilters
) {
  if (layer.paths.length === 0) {
    return;
  }

  const cachedGeometry = context.getStrokeGeometry(layer);

  context.brushShaderProgram.use();
  context.brushShaderProgram.setProjection(camera.projectionMatrix);
  context.brushShaderProgram.setFilters(filters.filters);
  context.brushShaderProgram.setAdjustmentFilters(filters.adjustments);
  context.bindMask(layer, context.brushShaderProgram);

  for (const path of cachedGeometry.paths) {
    context.brushShaderProgram.setColor(
      context.getRenderColor(path.color, layer.opacity * filters.opacity)
    );
    context.brushShaderProgram.setBrushStyle(path.brushStyle);
    context.brushShaderProgram.setBrushSize(path.brushSize);
    context.brushShaderProgram.setSelectionClip(getLayerSelectionClip(layer, path.selectionClip ?? null));
    context.drawBrushLayerLocalVertexData(layer, path.vertices, path.texCoords);
  }
}
