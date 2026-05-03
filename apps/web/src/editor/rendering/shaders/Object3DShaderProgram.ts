/** Shader program for isolated 3D object layer rendering. */
import { ShaderProgram } from "./ShaderProgram";
import type {
  LayerFilterAdjustment,
  LayerFilterSettings,
  LayerTextureSettings
} from "../../layers/Layer";

const maxAdjustmentFilters = 4;

export class Object3DShaderProgram extends ShaderProgram {
  readonly normalAttributeLocation: number;
  readonly texCoordAttributeLocation: number;
  private readonly adjustmentABrightnessContrastSaturationGrayscaleUniformLocations:
    WebGLUniformLocation[];
  private readonly adjustmentBHueInvertSepiaShadowUniformLocations: WebGLUniformLocation[];
  private readonly adjustmentBoundsUniformLocations: WebGLUniformLocation[];
  private readonly adjustmentCountUniformLocation: WebGLUniformLocation;
  private readonly adjustmentInverseMatrixUniformLocations: WebGLUniformLocation[];
  private readonly adjustmentSizeUniformLocations: WebGLUniformLocation[];
  private readonly ambientUniformLocation: WebGLUniformLocation;
  private readonly filterBrightnessUniformLocation: WebGLUniformLocation;
  private readonly filterContrastUniformLocation: WebGLUniformLocation;
  private readonly filterGrayscaleUniformLocation: WebGLUniformLocation;
  private readonly filterHueUniformLocation: WebGLUniformLocation;
  private readonly filterInvertUniformLocation: WebGLUniformLocation;
  private readonly filterSaturationUniformLocation: WebGLUniformLocation;
  private readonly filterSepiaUniformLocation: WebGLUniformLocation;
  private readonly filterShadowUniformLocation: WebGLUniformLocation;
  private readonly layerModelUniformLocation: WebGLUniformLocation;
  private readonly lightIntensityUniformLocation: WebGLUniformLocation;
  private readonly lightPositionUniformLocation: WebGLUniformLocation;
  private readonly maskEnabledUniformLocation: WebGLUniformLocation;
  private readonly maskUniformLocation: WebGLUniformLocation;
  private readonly materialColorUniformLocation: WebGLUniformLocation;
  private readonly model3DUniformLocation: WebGLUniformLocation;
  private readonly normalModelUniformLocation: WebGLUniformLocation;
  private readonly objectScaleUniformLocation: WebGLUniformLocation;
  private readonly opacityUniformLocation: WebGLUniformLocation;
  private readonly projectionUniformLocation: WebGLUniformLocation;
  private readonly textureBlendUniformLocation: WebGLUniformLocation;
  private readonly textureColorUniformLocation: WebGLUniformLocation;
  private readonly textureContrastUniformLocation: WebGLUniformLocation;
  private readonly textureKindUniformLocation: WebGLUniformLocation;
  private readonly textureScaleUniformLocation: WebGLUniformLocation;
  private readonly viewProjection3DUniformLocation: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext, vertexShaderSource: string, fragmentShaderSource: string) {
    super(gl, vertexShaderSource, fragmentShaderSource);

    this.normalAttributeLocation = gl.getAttribLocation(this.program, "a_normal");
    this.texCoordAttributeLocation = gl.getAttribLocation(this.program, "a_texCoord");
    this.adjustmentCountUniformLocation = this.getUniformLocation("u_adjustmentCount");
    this.adjustmentBoundsUniformLocations = this.getUniformArrayLocations(
      "u_adjustmentBounds",
      maxAdjustmentFilters
    );
    this.adjustmentABrightnessContrastSaturationGrayscaleUniformLocations =
      this.getUniformArrayLocations("u_adjustmentA", maxAdjustmentFilters);
    this.adjustmentBHueInvertSepiaShadowUniformLocations = this.getUniformArrayLocations(
      "u_adjustmentB",
      maxAdjustmentFilters
    );
    this.adjustmentInverseMatrixUniformLocations = this.getUniformArrayLocations(
      "u_adjustmentInverseMatrix",
      maxAdjustmentFilters
    );
    this.adjustmentSizeUniformLocations = this.getUniformArrayLocations(
      "u_adjustmentSize",
      maxAdjustmentFilters
    );
    this.ambientUniformLocation = this.getUniformLocation("u_ambient");
    this.filterBrightnessUniformLocation = this.getUniformLocation("u_filterBrightness");
    this.filterContrastUniformLocation = this.getUniformLocation("u_filterContrast");
    this.filterGrayscaleUniformLocation = this.getUniformLocation("u_filterGrayscale");
    this.filterHueUniformLocation = this.getUniformLocation("u_filterHue");
    this.filterInvertUniformLocation = this.getUniformLocation("u_filterInvert");
    this.filterSaturationUniformLocation = this.getUniformLocation("u_filterSaturation");
    this.filterSepiaUniformLocation = this.getUniformLocation("u_filterSepia");
    this.filterShadowUniformLocation = this.getUniformLocation("u_filterShadow");
    this.layerModelUniformLocation = this.getUniformLocation("u_layerModel");
    this.lightIntensityUniformLocation = this.getUniformLocation("u_lightIntensity");
    this.lightPositionUniformLocation = this.getUniformLocation("u_lightPosition");
    this.maskEnabledUniformLocation = this.getUniformLocation("u_maskEnabled");
    this.maskUniformLocation = this.getUniformLocation("u_mask");
    this.materialColorUniformLocation = this.getUniformLocation("u_materialColor");
    this.model3DUniformLocation = this.getUniformLocation("u_model3D");
    this.normalModelUniformLocation = this.getUniformLocation("u_normalModel");
    this.objectScaleUniformLocation = this.getUniformLocation("u_objectScale");
    this.opacityUniformLocation = this.getUniformLocation("u_opacity");
    this.projectionUniformLocation = this.getUniformLocation("u_projection");
    this.textureBlendUniformLocation = this.getUniformLocation("u_textureBlend");
    this.textureColorUniformLocation = this.getUniformLocation("u_textureColor");
    this.textureContrastUniformLocation = this.getUniformLocation("u_textureContrast");
    this.textureKindUniformLocation = this.getUniformLocation("u_textureKind");
    this.textureScaleUniformLocation = this.getUniformLocation("u_textureScale");
    this.viewProjection3DUniformLocation = this.getUniformLocation("u_viewProjection3D");

    if (this.normalAttributeLocation < 0 || this.texCoordAttributeLocation < 0) {
      throw new Error("WebGL 3D object attributes are unavailable.");
    }
  }

  setAdjustmentFilters(adjustments: LayerFilterAdjustment[]) {
    const count = Math.min(adjustments.length, maxAdjustmentFilters);

    this.gl.uniform1i(this.adjustmentCountUniformLocation, count);

    for (let index = 0; index < maxAdjustmentFilters; index += 1) {
      const adjustment = adjustments[index];
      const filters = adjustment?.filters;

      this.gl.uniform4fv(
        this.adjustmentBoundsUniformLocations[index],
        adjustment?.bounds ?? [0, 0, 0, 0]
      );
      this.gl.uniformMatrix3fv(
        this.adjustmentInverseMatrixUniformLocations[index],
        false,
        adjustment?.inverseMatrix ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]
      );
      this.gl.uniform2fv(this.adjustmentSizeUniformLocations[index], adjustment?.size ?? [0, 0]);
      this.gl.uniform4f(
        this.adjustmentABrightnessContrastSaturationGrayscaleUniformLocations[index],
        filters?.brightness ?? 0,
        filters?.contrast ?? 0,
        filters?.saturation ?? 0,
        filters?.grayscale ?? 0
      );
      this.gl.uniform4f(
        this.adjustmentBHueInvertSepiaShadowUniformLocations[index],
        filters?.hue ?? 0,
        filters?.invert ?? 0,
        filters?.sepia ?? 0,
        filters?.shadow ?? 0
      );
    }
  }

  setFilters(filters: LayerFilterSettings) {
    this.gl.uniform1f(this.filterBrightnessUniformLocation, filters.brightness);
    this.gl.uniform1f(this.filterContrastUniformLocation, filters.contrast);
    this.gl.uniform1f(this.filterGrayscaleUniformLocation, filters.grayscale);
    this.gl.uniform1f(this.filterHueUniformLocation, filters.hue);
    this.gl.uniform1f(this.filterInvertUniformLocation, filters.invert);
    this.gl.uniform1f(this.filterSaturationUniformLocation, filters.saturation);
    this.gl.uniform1f(this.filterSepiaUniformLocation, filters.sepia);
    this.gl.uniform1f(this.filterShadowUniformLocation, filters.shadow);
  }

  setLayerModel(matrix: Float32Array) {
    this.gl.uniformMatrix3fv(this.layerModelUniformLocation, false, matrix);
  }

  setLighting(lightPosition: [number, number, number], ambient: number, intensity: number) {
    this.gl.uniform3fv(this.lightPositionUniformLocation, lightPosition);
    this.gl.uniform1f(this.ambientUniformLocation, ambient);
    this.gl.uniform1f(this.lightIntensityUniformLocation, intensity);
  }

  setMaskEnabled(enabled: boolean) {
    this.gl.uniform1i(this.maskEnabledUniformLocation, enabled ? 1 : 0);
  }

  setMaskTextureUnit(textureUnit: number) {
    this.gl.uniform1i(this.maskUniformLocation, textureUnit);
  }

  setMaterial(color: [number, number, number, number], texture: LayerTextureSettings) {
    const textureKind = getTextureKindUniform(texture.kind);

    this.gl.uniform4fv(this.materialColorUniformLocation, color);
    this.gl.uniform1i(this.textureKindUniformLocation, textureKind);
    this.gl.uniform1f(this.textureBlendUniformLocation, textureKind === 0 ? 0 : texture.blend);
    this.gl.uniform4fv(this.textureColorUniformLocation, texture.color);
    this.gl.uniform1f(this.textureContrastUniformLocation, texture.contrast);
    this.gl.uniform1f(this.textureScaleUniformLocation, texture.scale);
  }

  setObjectScale(x: number, y: number) {
    this.gl.uniform2f(this.objectScaleUniformLocation, x, y);
  }

  setOpacity(opacity: number) {
    this.gl.uniform1f(this.opacityUniformLocation, opacity);
  }

  setProjection(matrix: Float32Array) {
    this.gl.uniformMatrix3fv(this.projectionUniformLocation, false, matrix);
  }

  setTransform3D(model: Float32Array, normalModel: Float32Array, viewProjection: Float32Array) {
    this.gl.uniformMatrix4fv(this.model3DUniformLocation, false, model);
    this.gl.uniformMatrix4fv(this.normalModelUniformLocation, false, normalModel);
    this.gl.uniformMatrix4fv(this.viewProjection3DUniformLocation, false, viewProjection);
  }

  private getUniformArrayLocations(name: string, count: number) {
    return Array.from({ length: count }, (_, index) =>
      this.getUniformLocation(`${name}[${index}]`)
    );
  }
}

function getTextureKindUniform(kind: LayerTextureSettings["kind"]) {
  switch (kind) {
    case "checkerboard":
      return 1;
    case "stripes":
      return 2;
    case "dots":
      return 3;
    case "grain":
      return 4;
    case "none":
      return 0;
  }
}
