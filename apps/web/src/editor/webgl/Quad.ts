import { ShaderProgram } from "./ShaderProgram";
import { TexturedShaderProgram } from "./TexturedShaderProgram";

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
    this.uploadStaticBuffers();
  }

  draw(shaderProgram: ShaderProgram) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
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

  drawTextured(shaderProgram: TexturedShaderProgram) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
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

  private uploadStaticBuffers() {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      this.gl.STATIC_DRAW
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordinateBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      this.gl.STATIC_DRAW
    );
  }
}
