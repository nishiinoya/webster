import { Camera2D } from "../../geometry/Camera2D";
import { ImageLayer, isDefaultImageLayerGeometry } from "../../layers/ImageLayer";
import { defaultLayerFilters, Layer } from "../../layers/Layer";
import { TexturedShaderProgram } from "../shaders/TexturedShaderProgram";
import { SolidColorShaderProgram } from "../shaders/SolidColorShaderProgram";
import { Quad } from "../geometry/Quad";
import { TextureManager } from "../textures/TextureManager";
import type { EffectiveLayerFilters } from "../filters/layerFilters";

type MaskShaderProgram = {
  setMaskEnabled(enabled: boolean): void;
  setMaskTextureUnit(unit: number): void;
};

type ImageLayerRendererContext = {
  gl: WebGLRenderingContext;
  quad: Quad;
  solidColorShaderProgram: SolidColorShaderProgram;
  texturedShaderProgram: TexturedShaderProgram;
  textureManager: TextureManager;
  bindMask: (layer: Layer, shaderProgram: MaskShaderProgram) => void;
  getLayerModelMatrix: (layer: Layer) => Float32Array;
  renderColorOverride: [number, number, number, number] | null;
};

/**
 * Draws an image layer with tinting, masks, and adjustment filters applied.
 */
export function renderImageLayer(
  context: ImageLayerRendererContext,
  layer: ImageLayer,
  camera: Camera2D,
  filters: EffectiveLayerFilters
) {
  context.texturedShaderProgram.use();
  context.texturedShaderProgram.setProjection(camera.projectionMatrix);
  context.texturedShaderProgram.setModel(context.getLayerModelMatrix(layer));
  context.texturedShaderProgram.setTextureUnit(0);
  context.texturedShaderProgram.setMaskTextureUnit(1);
  context.texturedShaderProgram.setOpacity(layer.opacity * filters.opacity);
  context.texturedShaderProgram.setFilters(filters.filters);
  context.texturedShaderProgram.setAdjustmentFilters(filters.adjustments);
  context.texturedShaderProgram.setTextureSize(layer.image.naturalWidth, layer.image.naturalHeight);
  context.texturedShaderProgram.setTintColor(context.renderColorOverride ?? [1, 1, 1, 1]);
  context.texturedShaderProgram.setTintEnabled(Boolean(context.renderColorOverride));
  context.gl.activeTexture(context.gl.TEXTURE0);
  context.gl.bindTexture(context.gl.TEXTURE_2D, context.textureManager.getTexture(layer));
  context.bindMask(layer, context.texturedShaderProgram);
  if (isDefaultImageLayerGeometry(layer.geometry)) {
    context.quad.drawTextured(context.texturedShaderProgram);
  } else {
    const geometry = getImageLayerVertexData(layer);

    context.quad.drawTexturedVertexData(
      context.texturedShaderProgram,
      geometry.vertices,
      geometry.texCoords,
      geometry.maskCoords
    );
  }
  context.texturedShaderProgram.setTintEnabled(false);
  context.solidColorShaderProgram.use();
  context.solidColorShaderProgram.setProjection(camera.projectionMatrix);
  context.solidColorShaderProgram.setFilters(defaultLayerFilters);
  context.solidColorShaderProgram.setAdjustmentFilters([]);
}

function getImageLayerVertexData(layer: ImageLayer) {
  const { corners, crop } = layer.geometry;

  return {
    vertices: new Float32Array([
      corners.bottomLeft.x,
      corners.bottomLeft.y,
      corners.bottomRight.x,
      corners.bottomRight.y,
      corners.topLeft.x,
      corners.topLeft.y,
      corners.topLeft.x,
      corners.topLeft.y,
      corners.bottomRight.x,
      corners.bottomRight.y,
      corners.topRight.x,
      corners.topRight.y
    ]),
    texCoords: new Float32Array([
      crop.left,
      crop.bottom,
      crop.right,
      crop.bottom,
      crop.left,
      crop.top,
      crop.left,
      crop.top,
      crop.right,
      crop.bottom,
      crop.right,
      crop.top
    ]),
    maskCoords: new Float32Array([
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      1,
      1,
      0,
      1,
      1
    ])
  };
}
