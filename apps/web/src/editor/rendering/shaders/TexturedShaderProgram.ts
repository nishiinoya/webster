import { ShaderProgram } from "./ShaderProgram";

export class TexturedShaderProgram extends ShaderProgram {
  readonly texCoordAttributeLocation: number;
  private readonly modelUniformLocation: WebGLUniformLocation;
  private readonly projectionUniformLocation: WebGLUniformLocation;
  private readonly textureUniformLocation: WebGLUniformLocation;
  private readonly maskEnabledUniformLocation: WebGLUniformLocation;
  private readonly maskUniformLocation: WebGLUniformLocation;
  private readonly opacityUniformLocation: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext, vertexShaderSource: string, fragmentShaderSource: string) {
    super(gl, vertexShaderSource, fragmentShaderSource);

    this.texCoordAttributeLocation = gl.getAttribLocation(this.program, "a_texCoord");
    this.modelUniformLocation = this.getUniformLocation("u_model");
    this.projectionUniformLocation = this.getUniformLocation("u_projection");
    this.textureUniformLocation = this.getUniformLocation("u_texture");
    this.maskEnabledUniformLocation = this.getUniformLocation("u_maskEnabled");
    this.maskUniformLocation = this.getUniformLocation("u_mask");
    this.opacityUniformLocation = this.getUniformLocation("u_opacity");

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

  setTextureUnit(textureUnit: number) {
    this.gl.uniform1i(this.textureUniformLocation, textureUnit);
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
}
