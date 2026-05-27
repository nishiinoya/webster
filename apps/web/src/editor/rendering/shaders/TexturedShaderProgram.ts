/** Textured layer shader program wrapper. */
import { ShaderProgram } from "./ShaderProgram";
import type { LayerFilterAdjustment, LayerFilterSettings } from "../../layers/Layer";

const maxAdjustmentFilters = 4;

export class TexturedShaderProgram extends ShaderProgram {
  readonly maskCoordAttributeLocation: number;
  readonly texCoordAttributeLocation: number;
  private readonly modelUniformLocation: WebGLUniformLocation;
  private readonly projectionUniformLocation: WebGLUniformLocation;
  private readonly textureUniformLocation: WebGLUniformLocation;
  private readonly tintColorUniformLocation: WebGLUniformLocation;
  private readonly tintEnabledUniformLocation: WebGLUniformLocation;
  private readonly filterBrightnessUniformLocation: WebGLUniformLocation;
  private readonly filterBlurUniformLocation: WebGLUniformLocation;
  private readonly filterContrastUniformLocation: WebGLUniformLocation;
  private readonly filterGrayscaleUniformLocation: WebGLUniformLocation;
  private readonly filterHueUniformLocation: WebGLUniformLocation;
  private readonly filterInvertUniformLocation: WebGLUniformLocation;
  private readonly filterSaturationUniformLocation: WebGLUniformLocation;
  private readonly filterSepiaUniformLocation: WebGLUniformLocation;
  private readonly filterShadowUniformLocation: WebGLUniformLocation;
  private readonly adjustmentABrightnessContrastSaturationGrayscaleUniformLocations:
    WebGLUniformLocation[];
  private readonly adjustmentBHueInvertSepiaShadowUniformLocations: WebGLUniformLocation[];
  private readonly adjustmentBoundsUniformLocations: WebGLUniformLocation[];
  private readonly adjustmentCountUniformLocation: WebGLUniformLocation;
  private readonly adjustmentInverseMatrixUniformLocations: WebGLUniformLocation[];
  private readonly adjustmentSizeUniformLocations: WebGLUniformLocation[];
  private readonly maskEnabledUniformLocation: WebGLUniformLocation;
  private readonly maskUniformLocation: WebGLUniformLocation;
  private readonly opacityUniformLocation: WebGLUniformLocation;
  private readonly textureTexelSizeUniformLocation: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext, vertexShaderSource: string, fragmentShaderSource: string) {
    super(gl, vertexShaderSource, fragmentShaderSource);

    this.texCoordAttributeLocation = gl.getAttribLocation(this.program, "a_texCoord");
    this.maskCoordAttributeLocation = gl.getAttribLocation(this.program, "a_maskCoord");
    this.modelUniformLocation = this.getUniformLocation("u_model");
    this.projectionUniformLocation = this.getUniformLocation("u_projection");
    this.textureUniformLocation = this.getUniformLocation("u_texture");
    this.tintColorUniformLocation = this.getUniformLocation("u_tintColor");
    this.tintEnabledUniformLocation = this.getUniformLocation("u_tintEnabled");
    this.filterBrightnessUniformLocation = this.getUniformLocation("u_filterBrightness");
    this.filterBlurUniformLocation = this.getUniformLocation("u_filterBlur");
    this.filterContrastUniformLocation = this.getUniformLocation("u_filterContrast");
    this.filterGrayscaleUniformLocation = this.getUniformLocation("u_filterGrayscale");
    this.filterHueUniformLocation = this.getUniformLocation("u_filterHue");
    this.filterInvertUniformLocation = this.getUniformLocation("u_filterInvert");
    this.filterSaturationUniformLocation = this.getUniformLocation("u_filterSaturation");
    this.filterSepiaUniformLocation = this.getUniformLocation("u_filterSepia");
    this.filterShadowUniformLocation = this.getUniformLocation("u_filterShadow");
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
    this.maskEnabledUniformLocation = this.getUniformLocation("u_maskEnabled");
    this.maskUniformLocation = this.getUniformLocation("u_mask");
    this.opacityUniformLocation = this.getUniformLocation("u_opacity");
    this.textureTexelSizeUniformLocation = this.getUniformLocation("u_textureTexelSize");

    if (this.texCoordAttributeLocation < 0) {
      throw new Error("WebGL texture coordinate attribute is unavailable.");
    }

    if (this.maskCoordAttributeLocation < 0) {
      throw new Error("WebGL mask coordinate attribute is unavailable.");
    }
  }

  setModel(matrix: Float32Array) {
    this.gl.uniformMatrix3fv(this.modelUniformLocation, false, matrix);
  }

  setProjection(matrix: Float32Array) {
    this.gl.uniformMatrix3fv(this.projectionUniformLocation, false, matrix);
  }

  setTextureUnit(textureUnit: number) {
    this.gl.uniform1i(this.textureUniformLocation, textureUnit);
  }

  setTintColor(color: [number, number, number, number]) {
    this.gl.uniform4fv(this.tintColorUniformLocation, color);
  }

  setTintEnabled(enabled: boolean) {
    this.gl.uniform1i(this.tintEnabledUniformLocation, enabled ? 1 : 0);
  }

  setFilters(filters: LayerFilterSettings) {
    this.gl.uniform1f(this.filterBrightnessUniformLocation, filters.brightness);
    this.gl.uniform1f(this.filterBlurUniformLocation, filters.blur);
    this.gl.uniform1f(this.filterContrastUniformLocation, filters.contrast);
    this.gl.uniform1f(this.filterGrayscaleUniformLocation, filters.grayscale);
    this.gl.uniform1f(this.filterHueUniformLocation, filters.hue);
    this.gl.uniform1f(this.filterInvertUniformLocation, filters.invert);
    this.gl.uniform1f(this.filterSaturationUniformLocation, filters.saturation);
    this.gl.uniform1f(this.filterSepiaUniformLocation, filters.sepia);
    this.gl.uniform1f(this.filterShadowUniformLocation, filters.shadow);
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
      this.gl.uniform2fv(
        this.adjustmentSizeUniformLocations[index],
        adjustment?.size ?? [0, 0]
      );
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

  setMaskEnabled(enabled: boolean) {
    this.gl.uniform1i(this.maskEnabledUniformLocation, enabled ? 1 : 0);
  }

  setMaskTextureUnit(textureUnit: number) {
    this.gl.uniform1i(this.maskUniformLocation, textureUnit);
  }

  setOpacity(opacity: number) {
    this.gl.uniform1f(this.opacityUniformLocation, opacity);
  }

  setTextureSize(width: number, height: number) {
    this.gl.uniform2f(
      this.textureTexelSizeUniformLocation,
      1 / Math.max(1, width),
      1 / Math.max(1, height)
    );
  }

  private getUniformArrayLocations(name: string, count: number) {
    return Array.from({ length: count }, (_, index) =>
      this.getUniformLocation(`${name}[${index}]`)
    );
  }
}
