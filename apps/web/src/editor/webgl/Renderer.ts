import { Camera2D } from "../core/Camera2D";
import { Scene } from "../core/Scene";
import { ShapeLayer } from "../layers/ShapeLayer";
import { CheckerboardShaderProgram } from "./CheckerboardShaderProgram";
import { loadShaderSource } from "./loadShaderSource";
import { Quad } from "./Quad";
import { SolidColorShaderProgram } from "./SolidColorShaderProgram";

export type RendererShaderSources = {
  checkerboardFragment: string;
  checkerboardVertex: string;
  solidFragment: string;
  solidVertex: string;
};

export class Renderer {
  private readonly gl: WebGLRenderingContext;
  private readonly solidColorShaderProgram: SolidColorShaderProgram;
  private readonly checkerboardShaderProgram: CheckerboardShaderProgram;
  private readonly quad: Quad;
  private width = 0;
  private height = 0;
  private cssWidth = 1;
  private cssHeight = 1;

  static async create(canvas: HTMLCanvasElement) {
    const [checkerboardFragment, checkerboardVertex, solidFragment, solidVertex] = await Promise.all([
      loadShaderSource("/glsl/checkerboard.frag.glsl"),
      loadShaderSource("/glsl/checkerboard.vert.glsl"),
      loadShaderSource("/glsl/solid.frag.glsl"),
      loadShaderSource("/glsl/solid.vert.glsl")
    ]);

    return new Renderer(canvas, {
      checkerboardFragment,
      checkerboardVertex,
      solidFragment,
      solidVertex
    });
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    shaderSources: RendererShaderSources
  ) {
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false
    });

    if (!gl) {
      throw new Error("WebGL is not available in this browser.");
    }

    this.gl = gl;
    this.solidColorShaderProgram = new SolidColorShaderProgram(
      gl,
      shaderSources.solidVertex,
      shaderSources.solidFragment
    );
    this.checkerboardShaderProgram = new CheckerboardShaderProgram(
      gl,
      shaderSources.checkerboardVertex,
      shaderSources.checkerboardFragment
    );
    this.quad = new Quad(gl);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  }

  resize() {
    const pixelRatio = window.devicePixelRatio || 1;
    const nextCssWidth = Math.max(1, this.canvas.clientWidth);
    const nextCssHeight = Math.max(1, this.canvas.clientHeight);
    const nextWidth = Math.max(1, Math.floor(nextCssWidth * pixelRatio));
    const nextHeight = Math.max(1, Math.floor(nextCssHeight * pixelRatio));

    if (
      this.width === nextWidth &&
      this.height === nextHeight &&
      this.cssWidth === nextCssWidth &&
      this.cssHeight === nextCssHeight
    ) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.cssWidth = nextCssWidth;
    this.cssHeight = nextCssHeight;
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.gl.viewport(0, 0, nextWidth, nextHeight);
  }

  render(scene: Scene, camera: Camera2D) {
    this.resize();
    camera.resize(this.cssWidth, this.cssHeight);
    this.clear();

    this.checkerboardShaderProgram.use();
    this.checkerboardShaderProgram.setProjection(camera.projectionMatrix);
    this.checkerboardShaderProgram.setCheckerboard(
      [0.22, 0.23, 0.25, 1],
      [0.31, 0.32, 0.35, 1],
      24
    );
    this.quad.draw(scene.document, this.checkerboardShaderProgram);

    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);

    for (const layer of scene.layers) {
      if (!layer.visible || layer.opacity <= 0) {
        continue;
      }

      if (layer instanceof ShapeLayer) {
        this.solidColorShaderProgram.setColor([
          layer.color[0],
          layer.color[1],
          layer.color[2],
          layer.color[3] * layer.opacity
        ]);
        this.quad.draw(layer, this.solidColorShaderProgram);
      }
    }
  }

  dispose() {
    this.quad.dispose();
    this.checkerboardShaderProgram.dispose();
    this.solidColorShaderProgram.dispose();
  }

  private clear() {
    this.gl.clearColor(0.07, 0.08, 0.09, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
}
