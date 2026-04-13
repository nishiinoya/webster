import { ShaderProgram } from "./ShaderProgram";
import { TexturedShaderProgram } from "./TexturedShaderProgram";
import { rotatePoint } from "../core/TransformGeometry";

export type QuadRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
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
    const center = {
      x: left + scaledWidth / 2,
      y: bottom + scaledHeight / 2
    };
    const bottomLeft = rotatePoint({ x: left, y: bottom }, center, rectangle.rotation ?? 0);
    const bottomRight = rotatePoint({ x: right, y: bottom }, center, rectangle.rotation ?? 0);
    const topLeft = rotatePoint({ x: left, y: top }, center, rectangle.rotation ?? 0);
    const topRight = rotatePoint({ x: right, y: top }, center, rectangle.rotation ?? 0);

    const vertices = new Float32Array([
      bottomLeft.x,
      bottomLeft.y,
      bottomRight.x,
      bottomRight.y,
      topLeft.x,
      topLeft.y,
      topLeft.x,
      topLeft.y,
      bottomRight.x,
      bottomRight.y,
      topRight.x,
      topRight.y
    ]);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
  }
}
