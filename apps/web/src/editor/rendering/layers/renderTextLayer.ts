import { Camera2D } from "../../geometry/Camera2D";
import { defaultLayerFilters, Layer } from "../../layers/Layer";
import { TextLayer } from "../../layers/TextLayer";
import type { EffectiveLayerFilters } from "../filters/layerFilters";
import { isFiniteFloatArray } from "../renderingHelpers";
import { SolidColorShaderProgram } from "../shaders/SolidColorShaderProgram";
import type { CompiledTextGeometry, TextCharacterBox } from "../text/CompiledTextGeometry";
import { buildCompiledTextGeometry } from "../text/CompiledTextGeometry";
import { FontLoader } from "../text/FontLoader";
import type { BitmapTextRect } from "../text/BitmapText";
import { layoutBitmapText } from "../text/BitmapText";

type MaskShaderProgram = {
  setMaskEnabled(enabled: boolean): void;
  setMaskTextureUnit(unit: number): void;
};

type TextEditState = {
  caretIndex: number;
  layerId: string;
  selectionEnd?: number | null;
  selectionStart?: number | null;
} | null | undefined;

type TextLayerRendererContext = {
  gl: WebGLRenderingContext;
  fontLoader: FontLoader;
  solidColorShaderProgram: SolidColorShaderProgram;
  supportsUint32Indices: boolean;
  textGeometryIndexBuffer: WebGLBuffer;
  textGeometryPositionBuffer: WebGLBuffer;
  textGeometryTexCoordBuffer: WebGLBuffer;
  bindMask: (layer: Layer, shaderProgram: MaskShaderProgram) => void;
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
 * Draws a text layer using compiled glyph geometry when available, with bitmap fallback.
 */
export function renderTextLayer(
  context: TextLayerRendererContext,
  layer: TextLayer,
  camera: Camera2D,
  textEdit: TextEditState,
  filters: EffectiveLayerFilters
) {
  const requestedCompiledFont = context.fontLoader.requestFont(
    layer.fontFamily,
    layer.bold,
    layer.italic
  );

  const compiledFont = requestedCompiledFont ?? layer.lastResolvedCompiledFont ?? null;

  if (requestedCompiledFont && !requestedCompiledFont.isFallbackWhileLoading) {
    layer.lastResolvedCompiledFont = requestedCompiledFont;
  }

  if (compiledFont) {
    const geometry = buildCompiledTextGeometry(
      layer,
      compiledFont.font,
      textEdit?.layerId === layer.id ? textEdit.caretIndex : layer.text.length,
      {
        synthesizeBold: compiledFont.synthesizeBold,
        synthesizeItalic: compiledFont.synthesizeItalic
      }
    );
    layer.lastTextMaskFrame = geometry.maskFrame;
    layer.lastTextCharacterBoxes = geometry.characterBoxes;

    if (textEdit?.layerId === layer.id) {
      drawTextSelection(context, layer, geometry.characterBoxes, textEdit);
    }

    const didDrawCompiledText = drawCompiledTextGeometry(context, layer, camera, geometry, filters);

    if (didDrawCompiledText && textEdit?.layerId === layer.id) {
      context.solidColorShaderProgram.setMaskEnabled(false);
      context.solidColorShaderProgram.setFilters(defaultLayerFilters);
      context.solidColorShaderProgram.setAdjustmentFilters([]);
      context.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);
      context.drawLayerLocalRectangle(layer, geometry.caret);
    }

    if (didDrawCompiledText && geometry.indices.length > 0) {
      return;
    }
  }

  const layout = layoutBitmapText(
    layer,
    textEdit?.layerId === layer.id ? textEdit.caretIndex : layer.text.length
  );
  layer.lastTextMaskFrame = layout.maskFrame;
  layer.lastTextCharacterBoxes = layout.characterBoxes;

  if (textEdit?.layerId === layer.id) {
    context.solidColorShaderProgram.use();
    context.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    context.solidColorShaderProgram.setFilters(defaultLayerFilters);
    context.solidColorShaderProgram.setAdjustmentFilters([]);
    drawTextSelection(context, layer, layout.characterBoxes, textEdit);
  }

  context.solidColorShaderProgram.use();
  context.solidColorShaderProgram.setProjection(camera.projectionMatrix);
  context.solidColorShaderProgram.setFilters(filters.filters);
  context.solidColorShaderProgram.setAdjustmentFilters(filters.adjustments);
  context.bindMask(layer, context.solidColorShaderProgram);
  context.solidColorShaderProgram.setColor(context.getRenderColor(layer.color, layer.opacity));

  for (const glyph of layout.glyphs) {
    context.drawLayerLocalRectangle(layer, glyph, layout.maskFrame);
  }

  if (textEdit?.layerId !== layer.id) {
    context.solidColorShaderProgram.setMaskEnabled(false);
    return;
  }

  context.solidColorShaderProgram.setMaskEnabled(false);
  context.solidColorShaderProgram.setFilters(defaultLayerFilters);
  context.solidColorShaderProgram.setAdjustmentFilters([]);
  context.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);
  context.drawLayerLocalRectangle(layer, layout.caret);
}

function drawCompiledTextGeometry(
  context: TextLayerRendererContext,
  layer: TextLayer,
  camera: Camera2D,
  geometry: CompiledTextGeometry,
  filters: EffectiveLayerFilters
) {
  if (geometry.indices.length === 0) {
    return true;
  }

  if (!isFiniteFloatArray(geometry.vertices) || !isFiniteFloatArray(geometry.texCoords)) {
    return false;
  }

  if (geometry.indices instanceof Uint32Array && !context.supportsUint32Indices) {
    return false;
  }

  const normalizedVertices = new Float32Array(geometry.vertices.length);

  for (let index = 0; index < geometry.vertices.length; index += 2) {
    normalizedVertices[index] = geometry.vertices[index] / layer.width;
    normalizedVertices[index + 1] = geometry.vertices[index + 1] / layer.height;
  }

  context.solidColorShaderProgram.use();
  context.solidColorShaderProgram.setProjection(camera.projectionMatrix);
  context.solidColorShaderProgram.setFilters(filters.filters);
  context.solidColorShaderProgram.setAdjustmentFilters(filters.adjustments);
  context.solidColorShaderProgram.setModel(context.getLayerModelMatrix(layer));
  context.bindMask(layer, context.solidColorShaderProgram);
  context.solidColorShaderProgram.setColor(context.getRenderColor(layer.color, layer.opacity));

  context.gl.bindBuffer(context.gl.ARRAY_BUFFER, context.textGeometryPositionBuffer);
  context.gl.bufferData(context.gl.ARRAY_BUFFER, normalizedVertices, context.gl.DYNAMIC_DRAW);
  context.gl.enableVertexAttribArray(context.solidColorShaderProgram.positionAttributeLocation);
  context.gl.vertexAttribPointer(
    context.solidColorShaderProgram.positionAttributeLocation,
    2,
    context.gl.FLOAT,
    false,
    0,
    0
  );

  context.gl.bindBuffer(context.gl.ARRAY_BUFFER, context.textGeometryTexCoordBuffer);
  context.gl.bufferData(context.gl.ARRAY_BUFFER, geometry.texCoords, context.gl.DYNAMIC_DRAW);
  context.gl.enableVertexAttribArray(context.solidColorShaderProgram.texCoordAttributeLocation);
  context.gl.vertexAttribPointer(
    context.solidColorShaderProgram.texCoordAttributeLocation,
    2,
    context.gl.FLOAT,
    false,
    0,
    0
  );

  context.gl.bindBuffer(context.gl.ELEMENT_ARRAY_BUFFER, context.textGeometryIndexBuffer);
  context.gl.bufferData(context.gl.ELEMENT_ARRAY_BUFFER, geometry.indices, context.gl.DYNAMIC_DRAW);
  context.gl.drawElements(
    context.gl.TRIANGLES,
    geometry.indices.length,
    geometry.indices instanceof Uint32Array ? context.gl.UNSIGNED_INT : context.gl.UNSIGNED_SHORT,
    0
  );

  return true;
}

function drawTextSelection(
  context: TextLayerRendererContext,
  layer: TextLayer,
  characterBoxes: TextCharacterBox[],
  textEdit: NonNullable<TextEditState>
) {
  if (textEdit.selectionStart === null || textEdit.selectionStart === undefined) {
    return;
  }

  if (textEdit.selectionEnd === null || textEdit.selectionEnd === undefined) {
    return;
  }

  const start = Math.min(textEdit.selectionStart, textEdit.selectionEnd);
  const end = Math.max(textEdit.selectionStart, textEdit.selectionEnd);

  if (start === end) {
    return;
  }

  context.solidColorShaderProgram.setMaskEnabled(false);
  context.solidColorShaderProgram.setFilters(defaultLayerFilters);
  context.solidColorShaderProgram.setAdjustmentFilters([]);
  context.solidColorShaderProgram.setColor([0.25, 0.56, 1, 0.35]);

  for (const box of characterBoxes) {
    if (box.index >= start && box.index < end) {
      context.drawLayerLocalRectangle(layer, box);
    }
  }
}
