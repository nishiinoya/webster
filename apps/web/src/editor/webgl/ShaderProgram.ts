export class ShaderProgram {
  constructor(private readonly gl: WebGLRenderingContext) {}

  use() {
    // Shader compilation and binding will be added with the first draw pass.
    void this.gl;
  }

  dispose() {
    // Program deletion will be added once this class owns a WebGLProgram.
  }
}
