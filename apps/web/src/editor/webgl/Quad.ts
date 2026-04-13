import { ShaderProgram } from "./ShaderProgram";
import { TexturedShaderProgram } from "./TexturedShaderProgram";

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
  private readonly textureCoordinateBuffer: WebGLBuffer;

  constructor(private readonly gl: WebGLRenderingContext) {
    const vertexBuffer = gl.createBuffer();
    const textureCoordinateBuffer = gl.createBuffer();

    if (!vertexBuffer || !textureCoordinateBuffer) {
      throw new Error("Unable to create WebGL quad vertex buffer.");
    }

    this.vertexBuffer = vertexBuffer;
    this.textureCoordinateBuffer = textureCoordinateBuffer;
  }

  draw(rectangle: QuadRectangle, shaderProgram: ShaderProgram) {
    this.uploadPositions(rectangle);
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

  drawTextured(rectangle: QuadRectangle, shaderProgram: TexturedShaderProgram) {
    this.uploadPositions(rectangle);
    this.gl.enableVertexAttribArray(shaderProgram.positionAttributeLocation);
    this.gl.vertexAttribPointer(
      shaderProgram.positionAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordinateBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      this.gl.STATIC_DRAW
    );
    this.gl.enableVertexAttribArray(shaderProgram.texCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      shaderProgram.texCoordAttributeLocation,
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
    this.gl.deleteBuffer(this.textureCoordinateBuffer);
  }

  private uploadPositions(rectangle: QuadRectangle) {
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
  }
}
