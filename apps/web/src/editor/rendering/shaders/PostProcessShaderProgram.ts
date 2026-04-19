import { ShaderProgram } from "./ShaderProgram";

export type BlurRegion = {
  bounds: [number, number, number, number];
  inverseMatrix: [number, number, number, number, number, number, number, number, number];
  radius: number;
  size: [number, number];
};

const maxBlurRegions = 4;

export class PostProcessShaderProgram extends ShaderProgram {
  readonly texCoordAttributeLocation: number;
  private readonly blurRegionBoundsUniformLocations: WebGLUniformLocation[];
  private readonly blurRegionCountUniformLocation: WebGLUniformLocation;
  private readonly blurRegionInverseMatrixUniformLocations: WebGLUniformLocation[];
  private readonly blurRegionRadiusUniformLocations: WebGLUniformLocation[];
  private readonly blurRegionSizeUniformLocations: WebGLUniformLocation[];
  private readonly textureTexelSizeUniformLocation: WebGLUniformLocation;
  private readonly textureUniformLocation: WebGLUniformLocation;
  private readonly viewportUniformLocation: WebGLUniformLocation;
  private readonly zoomUniformLocation: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext, vertexShaderSource: string, fragmentShaderSource: string) {
    super(gl, vertexShaderSource, fragmentShaderSource);

    this.texCoordAttributeLocation = gl.getAttribLocation(this.program, "a_texCoord");
    this.textureUniformLocation = this.getUniformLocation("u_texture");
    this.textureTexelSizeUniformLocation = this.getUniformLocation("u_textureTexelSize");
    this.viewportUniformLocation = this.getUniformLocation("u_viewport");
    this.zoomUniformLocation = this.getUniformLocation("u_zoom");
    this.blurRegionCountUniformLocation = this.getUniformLocation("u_blurRegionCount");
    this.blurRegionBoundsUniformLocations = this.getUniformArrayLocations(
      "u_blurRegionBounds",
      maxBlurRegions
    );
    this.blurRegionRadiusUniformLocations = this.getUniformArrayLocations(
      "u_blurRegionRadius",
      maxBlurRegions
    );
    this.blurRegionInverseMatrixUniformLocations = this.getUniformArrayLocations(
      "u_blurRegionInverseMatrix",
      maxBlurRegions
    );
    this.blurRegionSizeUniformLocations = this.getUniformArrayLocations(
      "u_blurRegionSize",
      maxBlurRegions
    );

    if (this.texCoordAttributeLocation < 0) {
      throw new Error("WebGL texture coordinate attribute is unavailable.");
    }
  }

  setBlurRegions(regions: BlurRegion[]) {
    const count = Math.min(regions.length, maxBlurRegions);

    this.gl.uniform1i(this.blurRegionCountUniformLocation, count);

    for (let index = 0; index < maxBlurRegions; index += 1) {
      const region = regions[index];

      this.gl.uniform4fv(
        this.blurRegionBoundsUniformLocations[index],
        region?.bounds ?? [0, 0, 0, 0]
      );
      this.gl.uniformMatrix3fv(
        this.blurRegionInverseMatrixUniformLocations[index],
        false,
        region?.inverseMatrix ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]
      );
      this.gl.uniform1f(this.blurRegionRadiusUniformLocations[index], region?.radius ?? 0);
      this.gl.uniform2fv(this.blurRegionSizeUniformLocations[index], region?.size ?? [0, 0]);
    }
  }

  setViewport(cameraX: number, cameraY: number, zoom: number, width: number, height: number) {
    this.gl.uniform4f(this.viewportUniformLocation, cameraX, cameraY, width, height);
    this.gl.uniform1f(this.zoomUniformLocation, zoom);
  }

  setTextureSize(width: number, height: number) {
    this.gl.uniform2f(
      this.textureTexelSizeUniformLocation,
      1 / Math.max(1, width),
      1 / Math.max(1, height)
    );
  }

  setTextureUnit(textureUnit: number) {
    this.gl.uniform1i(this.textureUniformLocation, textureUnit);
  }

  private getUniformArrayLocations(name: string, count: number) {
    return Array.from({ length: count }, (_, index) =>
      this.getUniformLocation(`${name}[${index}]`)
    );
  }
}
