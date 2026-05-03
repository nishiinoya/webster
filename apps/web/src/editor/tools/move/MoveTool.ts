/** Move and transform tool implementation. */
import { Camera2D } from "../../geometry/Camera2D";
import { Scene } from "../../scene/Scene";
import {
  getLayerCorners,
  getLayerCenter,
  getLayerSize,
  getTransformHandles,
  rotateVector,
  TransformHandleId
} from "../../geometry/TransformGeometry";
import { AdjustmentLayer } from "../../layers/AdjustmentLayer";
import { GroupLayer } from "../../layers/GroupLayer";
import { cloneImageLayerGeometry, ImageLayer } from "../../layers/ImageLayer";
import type { ImageLayerGeometry } from "../../layers/Layer";
import { Layer } from "../../layers/Layer";
import { TextLayer } from "../../layers/TextLayer";
import { LayerMask } from "../../masks/LayerMask";

export type ToolPointerEvent = {
  altKey?: boolean;
  button: number;
  clientX: number;
  clientY: number;
  detail?: number;
  shiftKey?: boolean;
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

type CropState = ResizeState & {
  baseCrop: ImageLayerGeometry["crop"] | null;
  baseMask: LayerMask | null;
};

type WarpPointState = {
  cornerId: ImageGeometryCornerId;
  layer: ImageLayer;
};

type RotateState = {
  center: Point;
  layer: Layer;
};

type Point = {
  x: number;
  y: number;
};

type MoveToolMode = "crop" | "move" | "transform";
type ImageGeometryCornerId = keyof ImageLayerGeometry["corners"];
type HandleClickState = {
  handleId: TransformHandleId;
  layerId: string;
  time: number;
};

export class MoveTool {
  private cropState: CropState | null = null;
  private dragState: DragState | null = null;
  private resizeState: ResizeState | null = null;
  private rotateState: RotateState | null = null;
  private warpPointState: WarpPointState | null = null;
  private lastHandleClick: HandleClickState | null = null;
  private mode: MoveToolMode = "move";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private scene: Scene,
    private readonly camera: Camera2D
  ) {}

  setScene(scene: Scene) {
    this.cancel();
    this.scene = scene;
  }

  setMode(mode: MoveToolMode) {
    if (this.mode === mode) {
      return;
    }

    this.cancel();
    this.mode = mode;
  }

  setTransformEnabled(enabled: boolean) {
    this.setMode(enabled ? "transform" : "move");
  }

  pointerDown(event: ToolPointerEvent) {
    if (event.button !== 0) {
      return false;
    }

    const worldPoint = this.clientToWorld(event.clientX, event.clientY);
    const selectedLayer =
      this.scene.selectedLayerIds.length === 1 && this.scene.selectedLayerId
        ? this.scene.getLayer(this.scene.selectedLayerId)
        : null;
    const handleId =
      this.mode !== "move" &&
      selectedLayer &&
      !selectedLayer.locked &&
      !(selectedLayer instanceof GroupLayer)
        ? this.hitTestHandle(selectedLayer, event.clientX, event.clientY)
        : null;
    const warpCornerHandleId =
      this.mode === "transform" && selectedLayer instanceof ImageLayer && !selectedLayer.locked
        ? this.hitTestImageWarpCorner(selectedLayer, event.clientX, event.clientY)
        : null;

    if (selectedLayer instanceof ImageLayer && warpCornerHandleId) {
      const isPointEditGesture =
        isDoubleClickEvent(event) ||
        this.isRepeatedHandleClick(selectedLayer, warpCornerHandleId);

      this.rememberHandleClick(selectedLayer, warpCornerHandleId);

      if (isPointEditGesture) {
        this.scene.selectLayer(selectedLayer.id);
        this.cropState = null;
        this.dragState = null;
        this.resizeState = null;
        this.rotateState = null;
        this.warpPointState = {
          cornerId: getImageGeometryCornerId(warpCornerHandleId),
          layer: selectedLayer
        };
        this.lastHandleClick = null;
        this.warpImagePoint(event);
        return true;
      }
    }

    if (selectedLayer && handleId) {
      this.scene.selectLayer(selectedLayer.id);
      this.cropState = null;
      this.dragState = null;
      this.warpPointState = null;

      if (this.mode === "crop") {
        if (handleId === "rotate") {
          return false;
        }

        this.cropState = this.createCropState(selectedLayer, handleId);
        this.cropLayer(event);
        return true;
      }

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
      this.mode !== "crop" &&
      isWorldPointInsideLayer(selectedLayer, worldPoint)
    ) {
      this.cropState = null;
      this.resizeState = null;
      this.rotateState = null;
      this.warpPointState = null;
      this.dragState = {
        layer: selectedLayer,
        offsetX: worldPoint.x - selectedLayer.x,
        offsetY: worldPoint.y - selectedLayer.y
      };

      return true;
    }

    if (
      selectedLayer instanceof GroupLayer &&
      !selectedLayer.locked &&
      this.mode !== "crop" &&
      isWorldPointInsideLayer(selectedLayer, worldPoint)
    ) {
      this.cropState = null;
      this.resizeState = null;
      this.rotateState = null;
      this.warpPointState = null;
      this.dragState = {
        layer: selectedLayer,
        offsetX: worldPoint.x - selectedLayer.x,
        offsetY: worldPoint.y - selectedLayer.y
      };

      return true;
    }

    const layer = this.scene.hitTestLayer(worldPoint.x, worldPoint.y);

    if (!layer) {
      this.cropState = null;
      this.dragState = null;
      this.resizeState = null;
      this.rotateState = null;
      this.warpPointState = null;
      return false;
    }

    this.scene.selectLayer(layer.id);

    if (layer.locked) {
      this.cropState = null;
      this.dragState = null;
      this.resizeState = null;
      this.rotateState = null;
      this.warpPointState = null;
      return true;
    }

    if (this.mode === "crop") {
      this.cropState = null;
      this.dragState = null;
      this.resizeState = null;
      this.rotateState = null;
      this.warpPointState = null;
      return true;
    }

    this.cropState = null;
    this.resizeState = null;
    this.rotateState = null;
    this.warpPointState = null;
    this.dragState = {
      layer,
      offsetX: worldPoint.x - layer.x,
      offsetY: worldPoint.y - layer.y
    };

    return true;
  }

  pointerMove(event: ToolPointerEvent) {
    if (this.cropState) {
      this.cropLayer(event);
      return true;
    }

    if (this.warpPointState) {
      this.warpImagePoint(event);
      return true;
    }

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
      this.cropState !== null ||
      this.dragState !== null ||
      this.resizeState !== null ||
      this.rotateState !== null ||
      this.warpPointState !== null;
    this.cropState = null;
    this.dragState = null;
    this.resizeState = null;
    this.rotateState = null;
    this.warpPointState = null;

    return wasDragging;
  }

  cancel() {
    this.cropState = null;
    this.dragState = null;
    this.resizeState = null;
    this.rotateState = null;
    this.warpPointState = null;
  }

  getCursor(clientX: number, clientY: number): ToolCursor {
    if (this.cropState) {
      return getHandleCursor(this.cropState.handleId, this.cropState.layer.rotation);
    }

    if (this.warpPointState) {
      return "crosshair";
    }

    if (this.rotateState) {
      return getRotateCursor(this.rotateState.layer.rotation);
    }

    if (this.resizeState) {
      return getHandleCursor(this.resizeState.handleId, this.resizeState.layer.rotation);
    }

    const selectedLayer =
      this.scene.selectedLayerIds.length === 1 && this.scene.selectedLayerId
        ? this.scene.getLayer(this.scene.selectedLayerId)
        : null;
    const handleId =
      this.mode !== "move" &&
      selectedLayer &&
      !selectedLayer.locked &&
      !(selectedLayer instanceof GroupLayer)
        ? this.hitTestHandle(selectedLayer, clientX, clientY)
        : null;

    if (handleId) {
      if (this.mode === "crop" && handleId === "rotate") {
        return "default";
      }

      return getHandleCursor(handleId, selectedLayer?.rotation ?? 0);
    }

    if (
      this.mode === "transform" &&
      selectedLayer instanceof ImageLayer &&
      !selectedLayer.locked &&
      this.hitTestImageWarpCorner(selectedLayer, clientX, clientY)
    ) {
      return "crosshair";
    }

    const worldPoint = this.clientToWorld(clientX, clientY);

    if (
      selectedLayer instanceof AdjustmentLayer &&
      !selectedLayer.locked &&
      this.mode !== "crop" &&
      isWorldPointInsideLayer(selectedLayer, worldPoint)
    ) {
      return "move";
    }

    if (this.mode === "crop") {
      return "default";
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

  private hitTestImageWarpCorner(layer: ImageLayer, clientX: number, clientY: number) {
    const screenPoint = this.clientToScreen(clientX, clientY);
    const corners = getLayerCorners(layer);
    const handles: Array<{ id: TransformHandleId; point: Point }> = [
      { id: "top-left", point: corners.topLeft },
      { id: "top-right", point: corners.topRight },
      { id: "bottom-right", point: corners.bottomRight },
      { id: "bottom-left", point: corners.bottomLeft }
    ];
    const hitRadius = 10;

    for (const handle of handles) {
      const handleScreenPoint = this.camera.worldToScreen(handle.point.x, handle.point.y);

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

  private createCropState(layer: Layer, handleId: TransformHandleId): CropState {
    return {
      ...this.createResizeState(layer, handleId),
      baseCrop: layer instanceof ImageLayer ? { ...layer.geometry.crop } : null,
      baseMask: layer.mask ? cloneLayerMaskWithId(layer.mask) : null
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

    if (isCornerHandle(state.handleId)) {
      const handleLocal = getHandleLocal(state.handleId, state.baseWidth, state.baseHeight);
      const diagonal = {
        x: handleLocal.x - state.anchorLocal.x,
        y: handleLocal.y - state.anchorLocal.y
      };
      const diagonalLengthSquared = diagonal.x * diagonal.x + diagonal.y * diagonal.y || 1;
      const scale = Math.max(
        minSize / state.baseWidth,
        minSize / state.baseHeight,
        (pointerDeltaLocal.x * diagonal.x + pointerDeltaLocal.y * diagonal.y) /
          diagonalLengthSquared
      );
      const projectedHandleLocal = {
        x: state.anchorLocal.x + diagonal.x * scale,
        y: state.anchorLocal.y + diagonal.y * scale
      };

      left = Math.min(state.anchorLocal.x, projectedHandleLocal.x);
      right = Math.max(state.anchorLocal.x, projectedHandleLocal.x);
      bottom = Math.min(state.anchorLocal.y, projectedHandleLocal.y);
      top = Math.max(state.anchorLocal.y, projectedHandleLocal.y);
    } else {
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

  private cropLayer(event: ToolPointerEvent) {
    const state = this.cropState;

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
      left = clamp(pointerLocal.x, 0, right - minSize);
    }

    if (affectsRight(state.handleId)) {
      right = clamp(pointerLocal.x, left + minSize, state.baseWidth);
    }

    if (affectsBottom(state.handleId)) {
      bottom = clamp(pointerLocal.y, 0, top - minSize);
    }

    if (affectsTop(state.handleId)) {
      top = clamp(pointerLocal.y, bottom + minSize, state.baseHeight);
    }

    this.applyLayerBounds(state, left, right, bottom, top);
    this.applyLayerMaskCrop(state, left, right, bottom, top);

    if (state.layer instanceof ImageLayer && state.baseCrop) {
      const cropSpanX = state.baseCrop.right - state.baseCrop.left;
      const cropSpanY = state.baseCrop.top - state.baseCrop.bottom;

      state.layer.geometry = {
        ...cloneImageLayerGeometry(state.layer.geometry),
        crop: {
          bottom: state.baseCrop.bottom + (bottom / state.baseHeight) * cropSpanY,
          left: state.baseCrop.left + (left / state.baseWidth) * cropSpanX,
          right: state.baseCrop.left + (right / state.baseWidth) * cropSpanX,
          top: state.baseCrop.bottom + (top / state.baseHeight) * cropSpanY
        }
      };
    }

    this.scene.updateLayer(state.layer.id, {});
  }

  private applyLayerMaskCrop(
    state: CropState,
    left: number,
    right: number,
    bottom: number,
    top: number
  ) {
    if (!state.baseMask || state.baseWidth <= 0 || state.baseHeight <= 0) {
      return;
    }

    state.layer.mask = cropLayerMaskToBounds({
      baseHeight: state.baseHeight,
      baseMask: state.baseMask,
      baseWidth: state.baseWidth,
      bottom,
      currentRevision: state.layer.mask?.revision ?? state.baseMask.revision,
      left,
      right,
      top
    });
  }

  private applyLayerBounds(
    state: ResizeState,
    left: number,
    right: number,
    bottom: number,
    top: number
  ) {
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

  private warpImagePoint(event: ToolPointerEvent) {
    const state = this.warpPointState;

    if (!state || state.layer.locked) {
      return;
    }

    const pointerWorld = this.clientToWorld(event.clientX, event.clientY);
    const pointerLocal = this.worldToLayerNormalizedPoint(state.layer, pointerWorld);
    const geometry = cloneImageLayerGeometry(state.layer.geometry);

    geometry.corners[state.cornerId] = pointerLocal;
    state.layer.geometry = geometry;
    reframeImageLayerToGeometryBounds(state.layer);
    this.scene.updateLayer(state.layer.id, {});
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

  private worldToLayerNormalizedPoint(
    layer: Layer,
    worldPoint: Point,
    options: { clamp?: boolean } = {}
  ) {
    const size = getLayerSize(layer);
    const center = getLayerCenter(layer);
    const localOffset = rotateVector(
      {
        x: worldPoint.x - center.x,
        y: worldPoint.y - center.y
      },
      -layer.rotation
    );
    const point = {
      x: (localOffset.x + size.width / 2) / Math.max(size.width, 1e-6),
      y: (localOffset.y + size.height / 2) / Math.max(size.height, 1e-6)
    };

    if (!options.clamp) {
      return point;
    }

    return {
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1)
    };
  }

  private isRepeatedHandleClick(layer: Layer, handleId: TransformHandleId) {
    const now = window.performance.now();
    const lastClick = this.lastHandleClick;

    return Boolean(
      lastClick &&
        lastClick.layerId === layer.id &&
        lastClick.handleId === handleId &&
        now - lastClick.time <= 420
    );
  }

  private rememberHandleClick(layer: Layer, handleId: TransformHandleId) {
    this.lastHandleClick = {
      handleId,
      layerId: layer.id,
      time: window.performance.now()
    };
  }
}

function isCornerHandle(handleId: TransformHandleId) {
  return (
    handleId === "top-left" ||
    handleId === "top-right" ||
    handleId === "bottom-right" ||
    handleId === "bottom-left"
  );
}

function getHandleLocal(handleId: TransformHandleId, width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;

  switch (handleId) {
    case "top-left":
      return { x: 0, y: height };
    case "top":
      return { x: centerX, y: height };
    case "top-right":
      return { x: width, y: height };
    case "right":
      return { x: width, y: centerY };
    case "bottom-right":
      return { x: width, y: 0 };
    case "bottom":
      return { x: centerX, y: 0 };
    case "bottom-left":
      return { x: 0, y: 0 };
    case "left":
      return { x: 0, y: centerY };
    case "rotate":
      return { x: centerX, y: centerY };
  }
}

function getImageGeometryCornerId(handleId: TransformHandleId): ImageGeometryCornerId {
  switch (handleId) {
    case "top-left":
      return "topLeft";
    case "top-right":
      return "topRight";
    case "bottom-right":
      return "bottomRight";
    case "bottom-left":
      return "bottomLeft";
    case "top":
    case "right":
    case "bottom":
    case "left":
    case "rotate":
      return "topLeft";
  }
}

function reframeImageLayerToGeometryBounds(layer: ImageLayer) {
  const geometry = cloneImageLayerGeometry(layer.geometry);
  const points = [
    geometry.corners.bottomLeft,
    geometry.corners.bottomRight,
    geometry.corners.topLeft,
    geometry.corners.topRight
  ];
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  if (spanX <= 1e-5 || spanY <= 1e-5) {
    return;
  }

  const previousSize = getLayerSize(layer);
  const previousCenter = getLayerCenter(layer);
  const nextWidth = previousSize.width * spanX;
  const nextHeight = previousSize.height * spanY;
  const nextCenterLocal = {
    x: (minX + spanX / 2) * previousSize.width - previousSize.width / 2,
    y: (minY + spanY / 2) * previousSize.height - previousSize.height / 2
  };
  const nextCenterOffset = rotateVector(nextCenterLocal, layer.rotation);
  const nextCenter = {
    x: previousCenter.x + nextCenterOffset.x,
    y: previousCenter.y + nextCenterOffset.y
  };

  layer.scaleX = nextWidth / layer.width;
  layer.scaleY = nextHeight / layer.height;
  layer.x = nextCenter.x - nextWidth / 2;
  layer.y = nextCenter.y - nextHeight / 2;
  geometry.corners = {
    bottomLeft: normalizeImageGeometryPoint(geometry.corners.bottomLeft, minX, minY, spanX, spanY),
    bottomRight: normalizeImageGeometryPoint(
      geometry.corners.bottomRight,
      minX,
      minY,
      spanX,
      spanY
    ),
    topLeft: normalizeImageGeometryPoint(geometry.corners.topLeft, minX, minY, spanX, spanY),
    topRight: normalizeImageGeometryPoint(geometry.corners.topRight, minX, minY, spanX, spanY)
  };
  layer.geometry = geometry;
}

function normalizeImageGeometryPoint(
  point: Point,
  minX: number,
  minY: number,
  spanX: number,
  spanY: number
) {
  return {
    x: (point.x - minX) / spanX,
    y: (point.y - minY) / spanY
  };
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

function isDoubleClickEvent(event: ToolPointerEvent) {
  return (event.detail ?? 0) >= 2;
}

function cloneLayerMaskWithId(mask: LayerMask) {
  const cloned = new LayerMask({
    data: new Uint8Array(mask.data),
    enabled: mask.enabled,
    height: mask.height,
    id: mask.id,
    width: mask.width
  });

  cloned.revision = mask.revision;

  return cloned;
}

function cropLayerMaskToBounds(options: {
  baseHeight: number;
  baseMask: LayerMask;
  baseWidth: number;
  bottom: number;
  currentRevision: number;
  left: number;
  right: number;
  top: number;
}) {
  const {
    baseHeight,
    baseMask,
    baseWidth,
    bottom,
    currentRevision,
    left,
    right,
    top
  } = options;
  const sourceLeft = clampInteger(
    Math.floor((left / baseWidth) * baseMask.width),
    0,
    baseMask.width - 1
  );
  const sourceRight = clampInteger(
    Math.ceil((right / baseWidth) * baseMask.width),
    sourceLeft + 1,
    baseMask.width
  );
  const sourceTop = clampInteger(
    Math.floor(((baseHeight - top) / baseHeight) * baseMask.height),
    0,
    baseMask.height - 1
  );
  const sourceBottom = clampInteger(
    Math.ceil(((baseHeight - bottom) / baseHeight) * baseMask.height),
    sourceTop + 1,
    baseMask.height
  );
  const width = sourceRight - sourceLeft;
  const height = sourceBottom - sourceTop;
  const data = new Uint8Array(width * height);

  for (let row = 0; row < height; row += 1) {
    const sourceStart = (sourceTop + row) * baseMask.width + sourceLeft;
    const targetStart = row * width;

    data.set(baseMask.data.subarray(sourceStart, sourceStart + width), targetStart);
  }

  const croppedMask = new LayerMask({
    data,
    enabled: baseMask.enabled,
    height,
    id: baseMask.id,
    width
  });

  croppedMask.revision = Math.max(baseMask.revision, currentRevision);
  croppedMask.markDirty();

  return croppedMask;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
