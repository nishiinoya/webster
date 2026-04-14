import { Camera2D } from "../core/Camera2D";
import { Scene } from "../core/Scene";
import { MaskBrushTool } from "./MaskBrushTool";
import type { MaskBrushOptions } from "./MaskBrushTool";
import { MoveTool } from "./MoveTool";
import type { ToolCursor, ToolPointerEvent } from "./MoveTool";

export class InputController {
  private readonly maskBrushTool: MaskBrushTool;
  private readonly moveTool: MoveTool;
  private selectedTool = "Move";

  constructor(canvas: HTMLCanvasElement, scene: Scene, camera: Camera2D) {
    this.moveTool = new MoveTool(canvas, scene, camera);
    this.maskBrushTool = new MaskBrushTool(canvas, scene, camera);
  }

  setScene(scene: Scene) {
    this.maskBrushTool.setScene(scene);
    this.moveTool.setScene(scene);
  }

  setSelectedTool(tool: string) {
    this.selectedTool = tool;
  }

  setMaskBrushOptions(options: Partial<MaskBrushOptions>) {
    this.maskBrushTool.setOptions(options);
  }

  pointerDown(event: ToolPointerEvent) {
    if (this.selectedTool === "Mask Brush") {
      return this.maskBrushTool.pointerDown(event);
    }

    if (this.selectedTool !== "Move") {
      return false;
    }

    return this.moveTool.pointerDown(event);
  }

  pointerMove(event: ToolPointerEvent) {
    if (this.selectedTool === "Mask Brush") {
      return this.maskBrushTool.pointerMove(event);
    }

    if (this.selectedTool !== "Move") {
      return false;
    }

    return this.moveTool.pointerMove(event);
  }

  pointerUp() {
    if (this.selectedTool === "Mask Brush") {
      return this.maskBrushTool.pointerUp();
    }

    return this.moveTool.pointerUp();
  }

  cancel() {
    this.maskBrushTool.cancel();
    this.moveTool.cancel();
  }

  undoLastMaskStroke() {
    return this.maskBrushTool.undoLastStroke();
  }

  getCursor(clientX: number, clientY: number): ToolCursor {
    if (this.selectedTool === "Mask Brush") {
      return this.maskBrushTool.getCursor();
    }

    if (this.selectedTool !== "Move") {
      return "default";
    }

    return this.moveTool.getCursor(clientX, clientY);
  }
}
