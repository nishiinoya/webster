import { ShaderProgram } from "./ShaderProgram";
import type { LayerFilterAdjustment, LayerFilterSettings } from "../../layers/Layer";

const maxAdjustmentFilters = 4;

export class BrushShaderProgram extends ShaderProgram {
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
  private readonly maskEnabledUniformLocation: WebGLUniformLocation;
  private readonly maskUniformLocation: WebGLUniformLocation;
  private readonly brushStyleUniformLocation: WebGLUniformLocation;
  private readonly brushSizeUniformLocation: WebGLUniformLocation;
  private readonly selectionEnabledUniformLocation: WebGLUniformLocation;
  private readonly selectionShapeUniformLocation: WebGLUniformLocation;
  private readonly selectionInvertedUniformLocation: WebGLUniformLocation;
  private readonly selectionBoundsUniformLocation: WebGLUniformLocation;

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
    this.maskEnabledUniformLocation = this.getUniformLocation("u_maskEnabled");
    this.maskUniformLocation = this.getUniformLocation("u_mask");
    this.brushStyleUniformLocation = this.getUniformLocation("u_brushStyle");
    this.brushSizeUniformLocation = this.getUniformLocation("u_brushSize");
    this.selectionEnabledUniformLocation = this.getUniformLocation("u_selectionEnabled");
    this.selectionShapeUniformLocation = this.getUniformLocation("u_selectionShape");
    this.selectionInvertedUniformLocation = this.getUniformLocation("u_selectionInverted");
    this.selectionBoundsUniformLocation = this.getUniformLocation("u_selectionBounds");

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

  setBrushStyle(style: number) {
    this.gl.uniform1i(this.brushStyleUniformLocation, style);
  }

  setBrushSize(size: number) {
    this.gl.uniform1f(this.brushSizeUniformLocation, size);
  }

  setSelectionClip(
    clip: {
      bounds: { height: number; width: number; x: number; y: number };
      inverted: boolean;
      shape: "ellipse" | "rectangle";
    } | null
  ) {
    this.gl.uniform1i(this.selectionEnabledUniformLocation, clip ? 1 : 0);

    if (!clip) {
      this.gl.uniform1i(this.selectionInvertedUniformLocation, 0);
      this.gl.uniform1i(this.selectionShapeUniformLocation, 0);
      this.gl.uniform4f(this.selectionBoundsUniformLocation, 0, 0, 0, 0);
      return;
    }

    this.gl.uniform1i(this.selectionInvertedUniformLocation, clip.inverted ? 1 : 0);
    this.gl.uniform1i(this.selectionShapeUniformLocation, clip.shape === "ellipse" ? 1 : 0);
    this.gl.uniform4f(
      this.selectionBoundsUniformLocation,
      clip.bounds.x,
      clip.bounds.y,
      clip.bounds.width,
      clip.bounds.height
    );
  }

  private getUniformArrayLocations(name: string, count: number) {
    return Array.from({ length: count }, (_, index) =>
      this.getUniformLocation(`${name}[${index}]`)
    );
  }
}
