export type CameraBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export class Camera2D {
  x = 0;
  y = 0;
  zoom = 1;
  projectionMatrix: Float32Array = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  private viewportWidth = 1;
  private viewportHeight = 1;
  private bounds: CameraBounds | null = null;

  resize(width: number, height: number) {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.clampToBounds();
    this.updateProjectionMatrix();
  }

  pan(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y += dy / this.zoom;
    this.clampToBounds();
    this.updateProjectionMatrix();
  }

  setZoom(zoom: number) {
    this.zoom = Math.min(Math.max(zoom, 0.1), 8);
    this.clampToBounds();
    this.updateProjectionMatrix();
  }

  zoomAt(screenX: number, screenY: number, delta: number) {
    const worldBeforeZoom = this.screenToWorld(screenX, screenY);
    const zoomFactor = Math.exp(-delta * 0.001);

    this.setZoom(this.zoom * zoomFactor);

    const worldAfterZoom = this.screenToWorld(screenX, screenY);
    this.x += worldBeforeZoom.x - worldAfterZoom.x;
    this.y += worldBeforeZoom.y - worldAfterZoom.y;
    this.clampToBounds();
    this.updateProjectionMatrix();
  }

  setBounds(bounds: CameraBounds | null) {
    this.bounds = bounds;
    this.clampToBounds();
    this.updateProjectionMatrix();
  }

  screenToWorld(x: number, y: number) {
    return {
      x: (x - this.viewportWidth / 2) / this.zoom + this.x,
      y: (this.viewportHeight / 2 - y) / this.zoom + this.y
    };
  }

  worldToScreen(x: number, y: number) {
    return {
      x: (x - this.x) * this.zoom + this.viewportWidth / 2,
      y: this.viewportHeight / 2 - (y - this.y) * this.zoom
    };
  }

  private updateProjectionMatrix() {
    const scaleX = (2 / this.viewportWidth) * this.zoom;
    const scaleY = (2 / this.viewportHeight) * this.zoom;

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

  private clampToBounds() {
    if (!this.bounds) {
      return;
    }

    const viewWidth = this.viewportWidth / this.zoom;
    const viewHeight = this.viewportHeight / this.zoom;
    const left = this.bounds.x;
    const right = this.bounds.x + this.bounds.width;
    const bottom = this.bounds.y;
    const top = this.bounds.y + this.bounds.height;

    this.x = clampCameraCenter(this.x, left, right, viewWidth);
    this.y = clampCameraCenter(this.y, bottom, top, viewHeight);
  }

  dispose() {
    // Camera owns no browser resources yet.
  }
}

function clampCameraCenter(center: number, min: number, max: number, viewSize: number) {
  const halfViewSize = viewSize / 2;

  if (viewSize >= max - min) {
    return Math.min(Math.max(center, max - halfViewSize), min + halfViewSize);
  }

  return Math.min(Math.max(center, min + halfViewSize), max - halfViewSize);
}
