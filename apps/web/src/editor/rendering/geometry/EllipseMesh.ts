import { ShaderProgram } from "../shaders/ShaderProgram";

type MaskableProgram = ShaderProgram & {
  texCoordAttributeLocation: number;
};

export class EllipseMesh {
  private readonly fillBuffer: WebGLBuffer;
  private readonly strokeBuffer: WebGLBuffer;
  private readonly fillVertexCount: number;
  private readonly segments: number;

  constructor(
    private readonly gl: WebGLRenderingContext,
    segments = 72
  ) {
    const fillVertices: number[] = [0.5, 0.5];
    this.segments = segments;

    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * (Math.PI * 2);
      const x = 0.5 + Math.cos(angle) * 0.5;
      const y = 0.5 + Math.sin(angle) * 0.5;

      fillVertices.push(x, y);
    }

    const fillBuffer = gl.createBuffer();
    const strokeBuffer = gl.createBuffer();

    if (!fillBuffer || !strokeBuffer) {
      throw new Error("Unable to create ellipse geometry buffers.");
    }

    this.fillBuffer = fillBuffer;
    this.strokeBuffer = strokeBuffer;
    this.fillVertexCount = fillVertices.length / 2;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fillVertices), gl.STATIC_DRAW);
  }

  drawFill(program: MaskableProgram) {
    this.bindPositionAndTexCoordBuffer(program, this.fillBuffer);
    this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, this.fillVertexCount);
  }

  drawStroke(program: MaskableProgram, strokeWidth: number, width: number, height: number) {
    const strokeVertices: number[] = [];
    const innerRadiusX = Math.max(0, 0.5 - strokeWidth / Math.max(1, width));
    const innerRadiusY = Math.max(0, 0.5 - strokeWidth / Math.max(1, height));

    for (let index = 0; index <= this.segments; index += 1) {
      const angle = (index / this.segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      strokeVertices.push(
        0.5 + cos * 0.5,
        0.5 + sin * 0.5,
        0.5 + cos * innerRadiusX,
        0.5 + sin * innerRadiusY
      );
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.strokeBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array(strokeVertices),
      this.gl.DYNAMIC_DRAW
    );
    this.bindPositionAndTexCoordBuffer(program, this.strokeBuffer);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, strokeVertices.length / 2);
  }

  dispose() {
    this.gl.deleteBuffer(this.fillBuffer);
    this.gl.deleteBuffer(this.strokeBuffer);
  }

  private bindPositionAndTexCoordBuffer(program: MaskableProgram, buffer: WebGLBuffer) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.enableVertexAttribArray(program.positionAttributeLocation);
    this.gl.vertexAttribPointer(
      program.positionAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
    this.gl.enableVertexAttribArray(program.texCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      program.texCoordAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
  }
}
