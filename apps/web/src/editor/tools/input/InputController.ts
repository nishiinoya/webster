import { Camera2D } from "../../geometry/Camera2D";
import { Scene } from "../../scene/Scene";
import { MaskBrushTool } from "../mask-brush/MaskBrushTool";
import type { MaskBrushOptions } from "../mask-brush/MaskBrushTypes";
import { MoveTool } from "../move/MoveTool";
import type { ToolCursor, ToolPointerEvent } from "../move/MoveTool";
import { SelectionTool } from "../selection/SelectionTool";

export class InputController {
  private readonly maskBrushTool: MaskBrushTool;
  private readonly moveTool: MoveTool;
  private readonly selectionTool: SelectionTool;
  private selectedTool = "Move";

  constructor(canvas: HTMLCanvasElement, scene: Scene, camera: Camera2D) {
    this.moveTool = new MoveTool(canvas, scene, camera);
    this.maskBrushTool = new MaskBrushTool(canvas, scene, camera);
    this.selectionTool = new SelectionTool(canvas, scene, camera);
  }

  setScene(scene: Scene) {
    this.maskBrushTool.setScene(scene);
    this.moveTool.setScene(scene);
    this.selectionTool.setScene(scene);
  }

  setSelectedTool(tool: string) {
    this.selectedTool = tool;

    if (tool === "Ellipse Select") {
      this.selectionTool.setShape("ellipse");
      return;
    }

    if (tool === "Marquee" || tool === "Rectangle Select") {
      this.selectionTool.setShape("rectangle");
    }
  }

  setMaskBrushOptions(options: Partial<MaskBrushOptions>) {
    this.maskBrushTool.setOptions(options);
  }

  pointerDown(event: ToolPointerEvent) {
    if (this.selectedTool === "Mask Brush") {
      return this.maskBrushTool.pointerDown(event);
    }

    if (isSelectionTool(this.selectedTool)) {
      return this.selectionTool.pointerDown(event);
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

    if (isSelectionTool(this.selectedTool)) {
      return this.selectionTool.pointerMove(event);
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

    if (isSelectionTool(this.selectedTool)) {
      return this.selectionTool.pointerUp();
    }

    return this.moveTool.pointerUp();
  }

  cancel() {
    this.maskBrushTool.cancel();
    this.moveTool.cancel();
    this.selectionTool.cancel();
  }

  undoLastMaskStroke() {
    return this.maskBrushTool.undoLastStroke();
  }

  getCursor(clientX: number, clientY: number): ToolCursor {
    if (this.selectedTool === "Mask Brush") {
      return this.maskBrushTool.getCursor();
    }

    if (isSelectionTool(this.selectedTool)) {
      return this.selectionTool.getCursor();
    }

    if (this.selectedTool !== "Move") {
      return "default";
    }

    return this.moveTool.getCursor(clientX, clientY);
  }
}

function isSelectionTool(tool: string) {
  return tool === "Marquee" || tool === "Rectangle Select" || tool === "Ellipse Select";
}
