import { Camera2D } from "../../geometry/Camera2D";
import { degreesToRadians } from "../../geometry/TransformGeometry";
import { defaultLayerFilters, Layer } from "../../layers/Layer";
import { Object3DLayer } from "../../layers/Object3DLayer";
import { Object3DMesh } from "../geometry/Object3DMesh";
import type { EffectiveLayerFilters } from "../filters/layerFilters";
import { Object3DShaderProgram } from "../shaders/Object3DShaderProgram";
import { SolidColorShaderProgram } from "../shaders/SolidColorShaderProgram";

type MaskShaderProgram = {
  setMaskEnabled(enabled: boolean): void;
  setMaskTextureUnit(unit: number): void;
};

type Object3DLayerRendererContext = {
  gl: WebGLRenderingContext;
  object3DShaderProgram: Object3DShaderProgram;
  solidColorShaderProgram: SolidColorShaderProgram;
  bindMask: (layer: Layer, shaderProgram: MaskShaderProgram) => void;
  drawLayerLocalEllipse: (
    layer: Layer,
    rectangle: { height: number; width: number; x: number; y: number }
  ) => void;
  getLayerModelMatrix: (layer: Layer) => Float32Array;
  getObject3DMesh: (layer: Object3DLayer) => Object3DMesh;
  renderColorOverride: [number, number, number, number] | null;
};

export function renderObject3DLayer(
  context: Object3DLayerRendererContext,
  layer: Object3DLayer,
  camera: Camera2D,
  filters: EffectiveLayerFilters
) {
  if (!context.renderColorOverride) {
    renderInternalShadow(context, layer, camera, filters);
  }

  const materialColor = context.renderColorOverride
    ? [
        context.renderColorOverride[0],
        context.renderColorOverride[1],
        context.renderColorOverride[2],
        layer.materialColor[3] * context.renderColorOverride[3]
      ] as [number, number, number, number]
    : layer.materialColor;
  const objectScale = getObjectScale(layer);
  const previousDepthTest = context.gl.isEnabled(context.gl.DEPTH_TEST);
  const previousDepthMask = context.gl.getParameter(context.gl.DEPTH_WRITEMASK) as boolean;

  context.object3DShaderProgram.use();
  context.object3DShaderProgram.setProjection(camera.projectionMatrix);
  context.object3DShaderProgram.setLayerModel(context.getLayerModelMatrix(layer));
  context.object3DShaderProgram.setTransform3D(
    getObjectModelMatrix(layer),
    getObjectModelMatrix(layer),
    getViewProjectionMatrix(layer)
  );
  context.object3DShaderProgram.setObjectScale(objectScale.x, objectScale.y);
  context.object3DShaderProgram.setMaterial(materialColor, layer.materialTexture);
  context.object3DShaderProgram.setOpacity(layer.opacity * filters.opacity);
  context.object3DShaderProgram.setLighting(
    [layer.lightX, layer.lightY, layer.lightZ],
    layer.ambient,
    layer.lightIntensity
  );
  context.object3DShaderProgram.setFilters(filters.filters);
  context.object3DShaderProgram.setAdjustmentFilters(filters.adjustments);
  context.object3DShaderProgram.setMaskTextureUnit(1);
  context.bindMask(layer, context.object3DShaderProgram);
  context.gl.enable(context.gl.DEPTH_TEST);
  context.gl.depthMask(true);
  context.gl.clearDepth(1);
  context.gl.clear(context.gl.DEPTH_BUFFER_BIT);
  context.getObject3DMesh(layer).draw(context.object3DShaderProgram);

  if (!previousDepthTest) {
    context.gl.disable(context.gl.DEPTH_TEST);
  }

  context.gl.depthMask(previousDepthMask);
  context.solidColorShaderProgram.use();
  context.solidColorShaderProgram.setProjection(camera.projectionMatrix);
  context.solidColorShaderProgram.setFilters(defaultLayerFilters);
  context.solidColorShaderProgram.setAdjustmentFilters([]);
}

function renderInternalShadow(
  context: Object3DLayerRendererContext,
  layer: Object3DLayer,
  camera: Camera2D,
  filters: EffectiveLayerFilters
) {
  if (layer.shadowOpacity <= 0) {
    return;
  }

  const shadow = getInternalShadowRectangle(layer);

  context.solidColorShaderProgram.use();
  context.solidColorShaderProgram.setProjection(camera.projectionMatrix);
  context.solidColorShaderProgram.setFilters({
    ...filters.filters,
    blur: Math.max(filters.filters.blur, layer.shadowSoftness)
  });
  context.solidColorShaderProgram.setAdjustmentFilters(filters.adjustments);
  context.solidColorShaderProgram.setColor([
    0,
    0,
    0,
    layer.shadowOpacity * layer.opacity * filters.opacity
  ]);
  context.bindMask(layer, context.solidColorShaderProgram);
  context.drawLayerLocalEllipse(layer, shadow);
}

function getInternalShadowRectangle(layer: Object3DLayer) {
  const baseWidth = layer.width * 0.56;
  const baseHeight = layer.height * 0.16;
  const softnessScale = 1 + layer.shadowSoftness / 96;
  const offsetX = clamp(-layer.lightX * layer.width * 0.022, -layer.width * 0.2, layer.width * 0.2);
  const offsetY = clamp(-layer.lightY * layer.height * 0.012, -layer.height * 0.08, layer.height * 0.08);
  const width = baseWidth * softnessScale;
  const height = baseHeight * softnessScale;

  return {
    height,
    width,
    x: layer.width * 0.5 - width / 2 + offsetX,
    y: layer.height * 0.13 - height / 2 + offsetY
  };
}

function getObjectScale(layer: Object3DLayer) {
  const aspect = layer.width / Math.max(1, layer.height);

  return {
    x: Math.min(0.4, 0.4 / Math.max(1, aspect)),
    y: Math.min(0.4, 0.4 * Math.min(1, aspect))
  };
}

function getObjectModelMatrix(layer: Object3DLayer) {
  return multiply4(
    multiply4(rotationZ(layer.rotationZ), rotationY(layer.rotationY)),
    rotationX(layer.rotationX)
  );
}

function getViewProjectionMatrix(layer: Object3DLayer) {
  const aspect = layer.width / Math.max(1, layer.height);
  const projection = perspective(degreesToRadians(38), aspect, 0.1, 100);
  const view = translation(0, 0, -5.2);

  return multiply4(projection, view);
}

function perspective(fovRadians: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovRadians / 2);
  const rangeInv = 1 / (near - far);

  return new Float32Array([
    f / Math.max(aspect, 1e-6),
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (near + far) * rangeInv,
    -1,
    0,
    0,
    near * far * rangeInv * 2,
    0
  ]);
}

function rotationX(degrees: number) {
  const radians = degreesToRadians(degrees);
  const c = Math.cos(radians);
  const s = Math.sin(radians);

  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function rotationY(degrees: number) {
  const radians = degreesToRadians(degrees);
  const c = Math.cos(radians);
  const s = Math.sin(radians);

  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function rotationZ(degrees: number) {
  const radians = degreesToRadians(degrees);
  const c = Math.cos(radians);
  const s = Math.sin(radians);

  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function translation(x: number, y: number, z: number) {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function multiply4(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16);

  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }

  return out;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
