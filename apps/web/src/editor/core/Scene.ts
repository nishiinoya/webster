export type SceneRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: [number, number, number, number];
};

export class Scene {
  readonly rectangle: SceneRectangle = {
    x: -130,
    y: -80,
    width: 260,
    height: 160,
    color: [0.18, 0.49, 0.44, 1]
  };

  dispose() {
    // Scene graph resources will be released here when drawing is added.
  }
}
