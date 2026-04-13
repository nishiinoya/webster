export class Camera2D {
  x = 0;
  y = 0;
  zoom = 1;
  projectionMatrix: Float32Array = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  resize(width: number, height: number) {
    const scaleX = (2 / width) * this.zoom;
    const scaleY = (2 / height) * this.zoom;

    this.projectionMatrix = new Float32Array([
      scaleX,
      0,
      0,
      0,
      scaleY,
      0,
      -this.x * scaleX,
      -this.y * scaleY,
      1
    ]);
  }

  dispose() {
    // Camera owns no browser resources yet.
  }
}
