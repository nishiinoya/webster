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
  private hasViewportSize = false;
  private bounds: CameraBounds | null = null;
  private readonly maxEdgePadding = 196;
  private readonly edgePaddingViewportRatio = 0.25;

  resize(width: number, height: number) {
    const previousWidth = this.viewportWidth;
    const previousHeight = this.viewportHeight;
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);

    if (this.hasViewportSize) {
      this.x += (this.viewportWidth - previousWidth) / (2 * this.zoom);
      this.y -= (this.viewportHeight - previousHeight) / (2 * this.zoom);
    } else {
      this.hasViewportSize = true;
    }

    this.updateProjectionMatrix();
  }

  pan(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y += dy / this.zoom;
    this.clampToBounds();
    this.updateProjectionMatrix();
  }

  setZoom(zoom: number) {
    this.zoom = Math.min(Math.max(zoom, 0.05), 100);
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

  fitBounds(bounds: CameraBounds, padding = 96) {
    const availableWidth = Math.max(1, this.viewportWidth - padding * 2);
    const availableHeight = Math.max(1, this.viewportHeight - padding * 2);
    const zoomX = availableWidth / Math.max(1, bounds.width);
    const zoomY = availableHeight / Math.max(1, bounds.height);

    this.x = bounds.x + bounds.width / 2;
    this.y = bounds.y + bounds.height / 2;
    this.zoom = Math.min(Math.max(Math.min(zoomX, zoomY), 0.05), 100);
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

    this.x = clampCameraCenter(
      this.x,
      left,
      right,
      viewWidth,
      this.getEdgePadding(this.viewportWidth)
    );
    this.y = clampCameraCenter(
      this.y,
      bottom,
      top,
      viewHeight,
      this.getEdgePadding(this.viewportHeight)
    );
  }

  private getEdgePadding(viewportSize: number) {
    return Math.min(
      this.maxEdgePadding,
      viewportSize * this.edgePaddingViewportRatio
    ) / this.zoom;
  }

  dispose() {
  }
}

function clampCameraCenter(
  center: number,
  min: number,
  max: number,
  viewSize: number,
  edgePadding: number
) {
  const halfViewSize = viewSize / 2;
  const boundsSize = max - min;

  if (viewSize >= boundsSize) {
    return Math.min(Math.max(center, max - halfViewSize), min + halfViewSize);
  }

  const padding = Math.min(edgePadding, boundsSize / 2);

  return Math.min(Math.max(center, min + padding - halfViewSize), max - padding + halfViewSize);
}
