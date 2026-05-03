/** Shared quad mesh used by multiple WebGL render paths. */
import { ShaderProgram } from "../shaders/ShaderProgram";
import { TexturedShaderProgram } from "../shaders/TexturedShaderProgram";

type TexturedDrawableProgram = ShaderProgram & {
  maskCoordAttributeLocation?: number;
  texCoordAttributeLocation: number;
};

export class Quad {
  private readonly maskCoordinateBuffer: WebGLBuffer;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly textureCoordinateBuffer: WebGLBuffer;

  constructor(private readonly gl: WebGLRenderingContext) {
    const maskCoordinateBuffer = gl.createBuffer();
    const vertexBuffer = gl.createBuffer();
    const textureCoordinateBuffer = gl.createBuffer();

    if (!maskCoordinateBuffer || !vertexBuffer || !textureCoordinateBuffer) {
      throw new Error("Unable to create WebGL quad vertex buffer.");
    }

    this.maskCoordinateBuffer = maskCoordinateBuffer;
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

  drawTextured(shaderProgram: TexturedDrawableProgram | TexturedShaderProgram) {
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

    this.bindMaskCoordinateAttribute(shaderProgram, this.maskCoordinateBuffer);

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  drawTexturedVertexData(
    shaderProgram: TexturedDrawableProgram | TexturedShaderProgram,
    vertices: Float32Array,
    texCoords: Float32Array,
    maskCoords?: Float32Array
  ) {
    if (
      vertices.length === 0 ||
      vertices.length !== texCoords.length ||
      (maskCoords && vertices.length !== maskCoords.length)
    ) {
      return;
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
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
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderProgram.texCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      shaderProgram.texCoordAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    if (typeof shaderProgram.maskCoordAttributeLocation === "number") {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.maskCoordinateBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, maskCoords ?? texCoords, this.gl.DYNAMIC_DRAW);
      this.bindMaskCoordinateAttribute(shaderProgram, this.maskCoordinateBuffer);
    }

    this.gl.drawArrays(this.gl.TRIANGLES, 0, vertices.length / 2);
    this.uploadStaticBuffers();
  }

  dispose() {
    this.gl.deleteBuffer(this.maskCoordinateBuffer);
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

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.maskCoordinateBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      this.gl.STATIC_DRAW
    );
  }

  private bindMaskCoordinateAttribute(
    shaderProgram: TexturedDrawableProgram | TexturedShaderProgram,
    buffer: WebGLBuffer
  ) {
    if (typeof shaderProgram.maskCoordAttributeLocation !== "number") {
      return;
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.enableVertexAttribArray(shaderProgram.maskCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      shaderProgram.maskCoordAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
  }
}
