import { Camera2D } from "../core/Camera2D";
import { Scene } from "../core/Scene";
import { MoveTool } from "./MoveTool";
import type { ToolPointerEvent } from "./MoveTool";

export class InputController {
  private readonly moveTool: MoveTool;
  private selectedTool = "Move";

  constructor(canvas: HTMLCanvasElement, scene: Scene, camera: Camera2D) {
    this.moveTool = new MoveTool(canvas, scene, camera);
  }

  setSelectedTool(tool: string) {
    this.selectedTool = tool;
  }

  pointerDown(event: ToolPointerEvent) {
    if (this.selectedTool !== "Move") {
      return false;
    }

    return this.moveTool.pointerDown(event);
  }

  pointerMove(event: ToolPointerEvent) {
    if (this.selectedTool !== "Move") {
      return false;
    }

    return this.moveTool.pointerMove(event);
  }

  pointerUp() {
    return this.moveTool.pointerUp();
  }

  cancel() {
    this.moveTool.cancel();
  }
}
