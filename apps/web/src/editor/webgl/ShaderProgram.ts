export class ShaderProgram {
  private readonly program: WebGLProgram;
  readonly positionAttributeLocation: number;
  private readonly projectionUniformLocation: WebGLUniformLocation;
  private readonly colorUniformLocation: WebGLUniformLocation;

  constructor(private readonly gl: WebGLRenderingContext) {
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

    const projectionUniformLocation = gl.getUniformLocation(program, "u_projection");
    const colorUniformLocation = gl.getUniformLocation(program, "u_color");

    if (!projectionUniformLocation || !colorUniformLocation) {
      gl.deleteProgram(program);
      throw new Error("WebGL shader uniforms are unavailable.");
    }

    this.program = program;
    this.positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    this.projectionUniformLocation = projectionUniformLocation;
    this.colorUniformLocation = colorUniformLocation;

    if (this.positionAttributeLocation < 0) {
      gl.deleteProgram(program);
      throw new Error("WebGL position attribute is unavailable.");
    }
  }

  use() {
    this.gl.useProgram(this.program);
  }

  setProjection(matrix: Float32Array) {
    this.gl.uniformMatrix3fv(this.projectionUniformLocation, false, matrix);
  }

  setColor(color: [number, number, number, number]) {
    this.gl.uniform4fv(this.colorUniformLocation, color);
  }

  dispose() {
    this.gl.deleteProgram(this.program);
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

const vertexShaderSource = `
attribute vec2 a_position;

uniform mat3 u_projection;

void main() {
  vec3 clipPosition = u_projection * vec3(a_position, 1.0);
  gl_Position = vec4(clipPosition.xy, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision mediump float;

uniform vec4 u_color;

void main() {
  gl_FragColor = u_color;
}
`;
