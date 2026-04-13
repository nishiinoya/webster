import { ShaderProgram } from "./ShaderProgram";

export class SolidColorShaderProgram extends ShaderProgram {
  private readonly modelUniformLocation: WebGLUniformLocation;
  private readonly projectionUniformLocation: WebGLUniformLocation;
  private readonly colorUniformLocation: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext, vertexShaderSource: string, fragmentShaderSource: string) {
    super(gl, vertexShaderSource, fragmentShaderSource);

    this.modelUniformLocation = this.getUniformLocation("u_model");
    this.projectionUniformLocation = this.getUniformLocation("u_projection");
    this.colorUniformLocation = this.getUniformLocation("u_color");
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
}
