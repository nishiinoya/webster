/** Base WebGL shader program abstraction. */
export class ShaderProgram {
  protected readonly program: WebGLProgram;
  readonly positionAttributeLocation: number;

  constructor(
    protected readonly gl: WebGLRenderingContext,
    vertexShaderSource: string,
    fragmentShaderSource: string
  ) {
    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();

    if (!program) {
      throw new Error("Unable to create WebGL shader program.");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) ?? "Unknown program link error.";
      gl.deleteProgram(program);
      throw new Error(info);
    }

    this.program = program;
    this.positionAttributeLocation = gl.getAttribLocation(program, "a_position");

    if (this.positionAttributeLocation < 0) {
      gl.deleteProgram(program);
      throw new Error("WebGL position attribute is unavailable.");
    }
  }

  use() {
    this.gl.useProgram(this.program);
  }

  dispose() {
    this.gl.deleteProgram(this.program);
  }

  protected getUniformLocation(name: string) {
    const location = this.gl.getUniformLocation(this.program, name);

    if (!location) {
      throw new Error(`WebGL uniform "${name}" is unavailable.`);
    }

    return location;
  }

  private createShader(type: number, source: string) {
    const shader = this.gl.createShader(type);

    if (!shader) {
      throw new Error("Unable to create WebGL shader.");
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader) ?? "Unknown shader compile error.";
      this.gl.deleteShader(shader);
      throw new Error(info);
    }

    return shader;
  }
}
