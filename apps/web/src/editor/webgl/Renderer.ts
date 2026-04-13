import { Camera2D } from "../core/Camera2D";
import { Scene } from "../core/Scene";
import { Quad } from "./Quad";
import { ShaderProgram } from "./ShaderProgram";

export class Renderer {
  private readonly gl: WebGLRenderingContext;
  private readonly shaderProgram: ShaderProgram;
  private readonly quad: Quad;
  private width = 0;
  private height = 0;

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
  }

  resize() {
    const pixelRatio = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const nextHeight = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));

    if (this.width === nextWidth && this.height === nextHeight) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.gl.viewport(0, 0, nextWidth, nextHeight);
  }

  render(scene: Scene, camera: Camera2D) {
    this.resize();
    camera.resize(this.width, this.height);
    this.clear();

    this.shaderProgram.use();
    this.shaderProgram.setProjection(camera.projectionMatrix);
    this.shaderProgram.setColor(scene.rectangle.color);
    this.quad.draw(scene.rectangle, this.shaderProgram);
  }

  dispose() {
    this.quad.dispose();
    this.shaderProgram.dispose();
  }

  private clear() {
    this.gl.clearColor(0.84, 0.86, 0.83, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
}
