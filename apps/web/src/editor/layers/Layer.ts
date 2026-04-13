export type LayerType = "shape";

export type LayerOptions = {
  id: string;
  type: LayerType;
  name: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
};

export abstract class Layer {
  readonly id: string;
  readonly type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;

  protected constructor(options: LayerOptions) {
    this.id = options.id;
    this.type = options.type;
    this.name = options.name;
    this.visible = options.visible ?? true;
    this.locked = options.locked ?? false;
    this.opacity = options.opacity ?? 1;
    this.x = options.x;
    this.y = options.y;
    this.width = options.width;
    this.height = options.height;
    this.rotation = options.rotation ?? 0;
    this.scaleX = options.scaleX ?? 1;
    this.scaleY = options.scaleY ?? 1;
  }
}
