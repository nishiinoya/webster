import { ShaderProgram } from "./ShaderProgram";

export type QuadRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX?: number;
  scaleY?: number;
};

export class Quad {
  private readonly vertexBuffer: WebGLBuffer;

  constructor(private readonly gl: WebGLRenderingContext) {
    const vertexBuffer = gl.createBuffer();

    if (!vertexBuffer) {
      throw new Error("Unable to create WebGL quad vertex buffer.");
    }

    this.vertexBuffer = vertexBuffer;
  }

  draw(rectangle: QuadRectangle, shaderProgram: ShaderProgram) {
    const { x, y, width, height, scaleX, scaleY } = rectangle;
    const scaledWidth = width * (scaleX ?? 1);
    const scaledHeight = height * (scaleY ?? 1);
    const left = x;
    const right = x + scaledWidth;
    const top = y + scaledHeight;
    const bottom = y;

    const vertices = new Float32Array([
      left,
      bottom,
      right,
      bottom,
      left,
      top,
      left,
      top,
      right,
      bottom,
      right,
      top
    ]);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(shaderProgram.positionAttributeLocation);
    this.gl.vertexAttribPointer(
      shaderProgram.positionAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  dispose() {
    this.gl.deleteBuffer(this.vertexBuffer);
  }
}
