import { Camera2D } from "../core/Camera2D";
import { Scene } from "../core/Scene";
import { ShapeLayer } from "../layers/ShapeLayer";
import { Quad } from "./Quad";
import { ShaderProgram } from "./ShaderProgram";

export class Renderer {
  private readonly gl: WebGLRenderingContext;
  private readonly shaderProgram: ShaderProgram;
  private readonly quad: Quad;
  private width = 0;
  private height = 0;
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
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
    this.shaderProgram = new ShaderProgram(gl);
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

    this.shaderProgram.use();
    this.shaderProgram.setProjection(camera.projectionMatrix);
    this.shaderProgram.setColor(scene.document.color);
    this.quad.draw(scene.document, this.shaderProgram);

    for (const layer of scene.layers) {
      if (!layer.visible || layer.opacity <= 0) {
        continue;
      }

      if (layer instanceof ShapeLayer) {
        this.shaderProgram.setColor([
          layer.color[0],
          layer.color[1],
          layer.color[2],
          layer.color[3] * layer.opacity
        ]);
        this.quad.draw(layer, this.shaderProgram);
      }
    }
  }

  dispose() {
    this.quad.dispose();
    this.shaderProgram.dispose();
  }

  private clear() {
    this.gl.clearColor(0.92, 0.94, 0.91, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
}
