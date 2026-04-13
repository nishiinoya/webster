export class Camera2D {
  x = 0;
  y = 0;
  zoom = 1;

  resize(_width: number, _height: number) {
    // Projection state will be added when rendering needs camera matrices.
  }

  dispose() {
    // Camera owns no browser resources yet.
  }
}
