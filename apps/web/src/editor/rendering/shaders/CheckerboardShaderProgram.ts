/** Checkerboard background shader program wrapper. */
import { ShaderProgram } from "./ShaderProgram";

export class CheckerboardShaderProgram extends ShaderProgram {
  private readonly modelUniformLocation: WebGLUniformLocation;
  private readonly projectionUniformLocation: WebGLUniformLocation;
  private readonly colorAUniformLocation: WebGLUniformLocation;
  private readonly colorBUniformLocation: WebGLUniformLocation;
  private readonly checkerSizeUniformLocation: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext, vertexShaderSource: string, fragmentShaderSource: string) {
    super(gl, vertexShaderSource, fragmentShaderSource);

    this.modelUniformLocation = this.getUniformLocation("u_model");
    this.projectionUniformLocation = this.getUniformLocation("u_projection");
    this.colorAUniformLocation = this.getUniformLocation("u_colorA");
    this.colorBUniformLocation = this.getUniformLocation("u_colorB");
    this.checkerSizeUniformLocation = this.getUniformLocation("u_checkerSize");
  }

  setModel(matrix: Float32Array) {
    this.gl.uniformMatrix3fv(this.modelUniformLocation, false, matrix);
  }

  setProjection(matrix: Float32Array) {
    this.gl.uniformMatrix3fv(this.projectionUniformLocation, false, matrix);
  }

  setCheckerboard(
    colorA: [number, number, number, number],
    colorB: [number, number, number, number],
    size: number
  ) {
    this.gl.uniform4fv(this.colorAUniformLocation, colorA);
    this.gl.uniform4fv(this.colorBUniformLocation, colorB);
    this.gl.uniform1f(this.checkerSizeUniformLocation, size);
  }
}
