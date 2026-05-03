/** Solid-color geometry shader program wrapper. */
import { ShaderProgram } from "./ShaderProgram";
import type { LayerFilterAdjustment, LayerFilterSettings } from "../../layers/Layer";

const maxAdjustmentFilters = 4;

export class SolidColorShaderProgram extends ShaderProgram {
  readonly texCoordAttributeLocation: number;
  private readonly modelUniformLocation: WebGLUniformLocation;
  private readonly projectionUniformLocation: WebGLUniformLocation;
  private readonly colorUniformLocation: WebGLUniformLocation;
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
  private readonly maskEdgeDashedUniformLocation: WebGLUniformLocation;
  private readonly maskEdgeEnabledUniformLocation: WebGLUniformLocation;
  private readonly maskEdgeDashPhaseUniformLocation: WebGLUniformLocation;
  private readonly maskEdgeTexCoordStepUniformLocation: WebGLUniformLocation;
  private readonly maskEdgeWorldToScreenScaleUniformLocation: WebGLUniformLocation;
  private readonly maskInvertedUniformLocation: WebGLUniformLocation;
  private readonly maskUniformLocation: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext, vertexShaderSource: string, fragmentShaderSource: string) {
    super(gl, vertexShaderSource, fragmentShaderSource);

    this.texCoordAttributeLocation = gl.getAttribLocation(this.program, "a_texCoord");
    this.modelUniformLocation = this.getUniformLocation("u_model");
    this.projectionUniformLocation = this.getUniformLocation("u_projection");
    this.colorUniformLocation = this.getUniformLocation("u_color");
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
    this.maskEdgeDashedUniformLocation = this.getUniformLocation("u_maskEdgeDashed");
    this.maskEdgeEnabledUniformLocation = this.getUniformLocation("u_maskEdgeEnabled");
    this.maskEdgeDashPhaseUniformLocation = this.getUniformLocation("u_maskEdgeDashPhase");
    this.maskEdgeTexCoordStepUniformLocation = this.getUniformLocation("u_maskEdgeTexCoordStep");
    this.maskEdgeWorldToScreenScaleUniformLocation = this.getUniformLocation(
      "u_maskEdgeWorldToScreenScale"
    );
    this.maskInvertedUniformLocation = this.getUniformLocation("u_maskInverted");
    this.maskUniformLocation = this.getUniformLocation("u_mask");

    if (this.texCoordAttributeLocation < 0) {
      throw new Error("WebGL texture coordinate attribute is unavailable.");
    }
  }

  setModel(matrix: Float32Array) {
    this.gl.uniformMatrix3fv(this.modelUniformLocation, false, matrix);
  }

  setProjection(matrix: Float32Array) {
    this.gl.uniformMatrix3fv(this.projectionUniformLocation, false, matrix);
  }

  setColor(color: [number, number, number, number]) {
    this.gl.uniform4fv(this.colorUniformLocation, color);
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
    this.gl.uniform1i(this.maskEdgeEnabledUniformLocation, 0);
    this.gl.uniform1i(this.maskInvertedUniformLocation, 0);
  }

  setMaskTextureUnit(textureUnit: number) {
    this.gl.uniform1i(this.maskUniformLocation, textureUnit);
  }

  setMaskInverted(inverted: boolean) {
    this.gl.uniform1i(this.maskInvertedUniformLocation, inverted ? 1 : 0);
  }

  setMaskEdgeEnabled(enabled: boolean) {
    this.gl.uniform1i(this.maskEdgeEnabledUniformLocation, enabled ? 1 : 0);
  }

  setMaskEdgeDashed(dashed: boolean) {
    this.gl.uniform1i(this.maskEdgeDashedUniformLocation, dashed ? 1 : 0);
  }

  setMaskEdgeDashPhase(phase: number) {
    this.gl.uniform1f(this.maskEdgeDashPhaseUniformLocation, phase);
  }

  setMaskEdgeTexCoordStep(x: number, y: number) {
    this.gl.uniform2f(this.maskEdgeTexCoordStepUniformLocation, Math.max(0, x), Math.max(0, y));
  }

  setMaskEdgeWorldToScreenScale(scale: number) {
    this.gl.uniform1f(this.maskEdgeWorldToScreenScaleUniformLocation, Math.max(1e-6, scale));
  }

  private getUniformArrayLocations(name: string, count: number) {
    return Array.from({ length: count }, (_, index) =>
      this.getUniformLocation(`${name}[${index}]`)
    );
  }
}
