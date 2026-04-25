/** Move and transform tool implementation. */
import { Camera2D } from "../../geometry/Camera2D";
import { Scene } from "../../scene/Scene";
import {
  getLayerCenter,
  getLayerSize,
  getTransformHandles,
  rotateVector,
  TransformHandleId
} from "../../geometry/TransformGeometry";
import { AdjustmentLayer } from "../../layers/AdjustmentLayer";
import { Layer } from "../../layers/Layer";
import { TextLayer } from "../../layers/TextLayer";

export type ToolPointerEvent = {
  button: number;
  clientX: number;
  clientY: number;
};

export type ToolCursor =
  | "default"
  | "move"
  | "ns-resize"
  | "ew-resize"
  | "nwse-resize"
  | "nesw-resize"
  | "grab"
  | "grabbing"
  | "crosshair"
  | "text"
  | `mask-brush-${number}-${"hide" | "reveal"}`
  | `rotate-${number}`;

type DragState = {
  layer: Layer;
  offsetX: number;
  offsetY: number;
};

type ResizeState = {
  anchorLocal: Point;
  anchorWorld: Point;
  baseHeight: number;
  baseRotation: number;
  baseWidth: number;
  handleId: TransformHandleId;
  layer: Layer;
};

type RotateState = {
  center: Point;
  layer: Layer;
};

type Point = {
  x: number;
  y: number;
};

export class MoveTool {
  private dragState: DragState | null = null;
  private resizeState: ResizeState | null = null;
  private rotateState: RotateState | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private scene: Scene,
    private readonly camera: Camera2D
  ) {}

  setScene(scene: Scene) {
    this.cancel();
    this.scene = scene;
  }

  pointerDown(event: ToolPointerEvent) {
    if (event.button !== 0) {
      return false;
    }

    const worldPoint = this.clientToWorld(event.clientX, event.clientY);
    const selectedLayer = this.scene.selectedLayerId
      ? this.scene.getLayer(this.scene.selectedLayerId)
      : null;
    const handleId =
      selectedLayer && !selectedLayer.locked
        ? this.hitTestHandle(selectedLayer, event.clientX, event.clientY)
        : null;

    if (selectedLayer && handleId) {
      this.scene.selectLayer(selectedLayer.id);
      this.dragState = null;

      if (handleId === "rotate") {
        this.rotateState = {
          center: getLayerCenter(selectedLayer),
          layer: selectedLayer
        };
        return true;
      }

      this.resizeState = this.createResizeState(selectedLayer, handleId);
      return true;
    }

    if (
      selectedLayer instanceof AdjustmentLayer &&
      !selectedLayer.locked &&
      isWorldPointInsideLayer(selectedLayer, worldPoint)
    ) {
      this.resizeState = null;
      this.rotateState = null;
      this.dragState = {
        layer: selectedLayer,
        offsetX: worldPoint.x - selectedLayer.x,
        offsetY: worldPoint.y - selectedLayer.y
      };

      return true;
    }

    const layer = this.scene.hitTestLayer(worldPoint.x, worldPoint.y);

    if (!layer) {
      this.dragState = null;
      this.resizeState = null;
      this.rotateState = null;
      return false;
    }

    this.scene.selectLayer(layer.id);

    if (layer.locked) {
      this.dragState = null;
      this.resizeState = null;
      this.rotateState = null;
      return true;
    }

    this.resizeState = null;
    this.rotateState = null;
    this.dragState = {
      layer,
      offsetX: worldPoint.x - layer.x,
      offsetY: worldPoint.y - layer.y
    };

    return true;
  }

  pointerMove(event: ToolPointerEvent) {
    if (this.resizeState) {
      this.resizeLayer(event);
      return true;
    }

    if (this.rotateState) {
      this.rotateLayer(event);
      return true;
    }

    if (!this.dragState || this.dragState.layer.locked) {
      return false;
    }

    const worldPoint = this.clientToWorld(event.clientX, event.clientY);

    this.scene.moveLayer(
      this.dragState.layer.id,
      worldPoint.x - this.dragState.offsetX,
      worldPoint.y - this.dragState.offsetY
    );

    return true;
  }

  pointerUp() {
    const wasDragging =
      this.dragState !== null || this.resizeState !== null || this.rotateState !== null;
    this.dragState = null;
    this.resizeState = null;
    this.rotateState = null;

    return wasDragging;
  }

  cancel() {
    this.dragState = null;
    this.resizeState = null;
    this.rotateState = null;
  }

  getCursor(clientX: number, clientY: number): ToolCursor {
    if (this.rotateState) {
      return getRotateCursor(this.rotateState.layer.rotation);
    }

    if (this.resizeState) {
      return getHandleCursor(this.resizeState.handleId, this.resizeState.layer.rotation);
    }

    const selectedLayer = this.scene.selectedLayerId
      ? this.scene.getLayer(this.scene.selectedLayerId)
      : null;
    const handleId =
      selectedLayer && !selectedLayer.locked
        ? this.hitTestHandle(selectedLayer, clientX, clientY)
        : null;

    if (handleId) {
      return getHandleCursor(handleId, selectedLayer?.rotation ?? 0);
    }

    const worldPoint = this.clientToWorld(clientX, clientY);

    if (
      selectedLayer instanceof AdjustmentLayer &&
      !selectedLayer.locked &&
      isWorldPointInsideLayer(selectedLayer, worldPoint)
    ) {
      return "move";
    }

    const layer = this.scene.hitTestLayer(worldPoint.x, worldPoint.y);

    return layer ? "move" : "default";
  }

  private clientToWorld(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();

    return this.camera.screenToWorld(clientX - bounds.left, clientY - bounds.top);
  }

  private clientToScreen(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();

    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top
    };
  }

  private hitTestHandle(layer: Layer, clientX: number, clientY: number) {
    const screenPoint = this.clientToScreen(clientX, clientY);
    const handles = getTransformHandles(layer, this.camera);
    const hitRadius = 8;

    for (const handle of handles) {
      const handleScreenPoint = this.camera.worldToScreen(handle.x, handle.y);

      if (
        Math.hypot(handleScreenPoint.x - screenPoint.x, handleScreenPoint.y - screenPoint.y) <=
        hitRadius
      ) {
        return handle.id;
      }
    }

    return null;
  }

  private createResizeState(layer: Layer, handleId: TransformHandleId): ResizeState {
    const { width, height } = getLayerSize(layer);
    const anchorLocal = getAnchorLocal(handleId, width, height);
    const centerLocal = {
      x: width / 2,
      y: height / 2
    };
    const centerWorld = getLayerCenter(layer);
    const anchorOffset = rotateVector(
      {
        x: anchorLocal.x - centerLocal.x,
        y: anchorLocal.y - centerLocal.y
      },
      layer.rotation
    );

    return {
      anchorLocal,
      anchorWorld: {
        x: centerWorld.x + anchorOffset.x,
        y: centerWorld.y + anchorOffset.y
      },
      baseHeight: height,
      baseRotation: layer.rotation,
      baseWidth: width,
      handleId,
      layer
    };
  }

  private resizeLayer(event: ToolPointerEvent) {
    const state = this.resizeState;

    if (!state || state.layer.locked) {
      return;
    }

    const pointerWorld = this.clientToWorld(event.clientX, event.clientY);
    const pointerDeltaLocal = rotateVector(
      {
        x: pointerWorld.x - state.anchorWorld.x,
        y: pointerWorld.y - state.anchorWorld.y
      },
      -state.baseRotation
    );
    const pointerLocal = {
      x: state.anchorLocal.x + pointerDeltaLocal.x,
      y: state.anchorLocal.y + pointerDeltaLocal.y
    };
    const minSize = 12;
    let left = 0;
    let right = state.baseWidth;
    let bottom = 0;
    let top = state.baseHeight;

    if (affectsLeft(state.handleId)) {
      left = Math.min(pointerLocal.x, right - minSize);
    }

    if (affectsRight(state.handleId)) {
      right = Math.max(pointerLocal.x, left + minSize);
    }

    if (affectsBottom(state.handleId)) {
      bottom = Math.min(pointerLocal.y, top - minSize);
    }

    if (affectsTop(state.handleId)) {
      top = Math.max(pointerLocal.y, bottom + minSize);
    }

    const width = right - left;
    const height = top - bottom;
    const centerLocal = {
      x: left + width / 2,
      y: bottom + height / 2
    };
    const centerWorldOffset = rotateVector(
      {
        x: centerLocal.x - state.anchorLocal.x,
        y: centerLocal.y - state.anchorLocal.y
      },
      state.baseRotation
    );
    const centerWorld = {
      x: state.anchorWorld.x + centerWorldOffset.x,
      y: state.anchorWorld.y + centerWorldOffset.y
    };

    if (state.layer instanceof TextLayer) {
      state.layer.width = width;
      state.layer.height = height;
      state.layer.scaleX = 1;
      state.layer.scaleY = 1;
    } else {
      state.layer.scaleX = width / state.layer.width;
      state.layer.scaleY = height / state.layer.height;
    }

    state.layer.x = centerWorld.x - width / 2;
    state.layer.y = centerWorld.y - height / 2;
  }

  private rotateLayer(event: ToolPointerEvent) {
    const state = this.rotateState;

    if (!state || state.layer.locked) {
      return;
    }

    const pointerWorld = this.clientToWorld(event.clientX, event.clientY);
    const angle = Math.atan2(pointerWorld.y - state.center.y, pointerWorld.x - state.center.x);

    state.layer.rotation = normalizeRotation((angle * 180) / Math.PI - 90);
  }
}

function getAnchorLocal(handleId: TransformHandleId, width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;

  switch (handleId) {
    case "top-left":
      return { x: width, y: 0 };
    case "top":
      return { x: centerX, y: 0 };
    case "top-right":
      return { x: 0, y: 0 };
    case "right":
      return { x: 0, y: centerY };
    case "bottom-right":
      return { x: 0, y: height };
    case "bottom":
      return { x: centerX, y: height };
    case "bottom-left":
      return { x: width, y: height };
    case "left":
      return { x: width, y: centerY };
    case "rotate":
      return { x: centerX, y: centerY };
  }
}

function affectsLeft(handleId: TransformHandleId) {
  return handleId === "top-left" || handleId === "left" || handleId === "bottom-left";
}

function affectsRight(handleId: TransformHandleId) {
  return handleId === "top-right" || handleId === "right" || handleId === "bottom-right";
}

function affectsBottom(handleId: TransformHandleId) {
  return handleId === "bottom-left" || handleId === "bottom" || handleId === "bottom-right";
}

function affectsTop(handleId: TransformHandleId) {
  return handleId === "top-left" || handleId === "top" || handleId === "top-right";
}

function isWorldPointInsideLayer(layer: Layer, point: Point) {
  const size = getLayerSize(layer);
  const center = getLayerCenter(layer);
  const localOffset = rotateVector(
    {
      x: point.x - center.x,
      y: point.y - center.y
    },
    -layer.rotation
  );

  return (
    localOffset.x >= -size.width / 2 &&
    localOffset.x <= size.width / 2 &&
    localOffset.y >= -size.height / 2 &&
    localOffset.y <= size.height / 2
  );
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

function getRotateCursor(rotation: number): ToolCursor {
  const angle = Math.round(normalizeRotation(rotation) / 15) * 15;

  return `rotate-${angle === 360 ? 0 : angle}`;
}

function getHandleCursor(handleId: TransformHandleId, rotation: number): ToolCursor {
  if (handleId === "rotate") {
    return getRotateCursor(rotation);
  }

  const angle = normalizeRotation(getHandleBaseAngle(handleId) + rotation) % 180;

  if (isNearAngle(angle, 0) || isNearAngle(angle, 180)) {
    return "ew-resize";
  }

  if (isNearAngle(angle, 45)) {
    return "nesw-resize";
  }

  if (isNearAngle(angle, 90)) {
    return "ns-resize";
  }

  return "nwse-resize";
}

function getHandleBaseAngle(handleId: TransformHandleId) {
  switch (handleId) {
    case "left":
    case "right":
      return 0;
    case "top":
    case "bottom":
      return 90;
    case "top-right":
    case "bottom-left":
      return 45;
    case "top-left":
    case "bottom-right":
      return 135;
    case "rotate":
      return 0;
  }
}

function isNearAngle(angle: number, target: number) {
  return Math.abs(angle - target) < 22.5;
}
