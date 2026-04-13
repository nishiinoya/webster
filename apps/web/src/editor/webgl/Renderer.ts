import { Camera2D } from "../core/Camera2D";
import { Scene } from "../core/Scene";
import {
  distance,
  getLayerCorners,
  getTransformHandles,
  midpoint
} from "../core/TransformGeometry";
import { ImageLayer } from "../layers/ImageLayer";
import { Layer } from "../layers/Layer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { CheckerboardShaderProgram } from "./CheckerboardShaderProgram";
import { loadShaderSource } from "./loadShaderSource";
import { Quad } from "./Quad";
import { SolidColorShaderProgram } from "./SolidColorShaderProgram";
import { TexturedShaderProgram } from "./TexturedShaderProgram";
import { TextureManager } from "./TextureManager";

export type RendererShaderSources = {
  checkerboardFragment: string;
  checkerboardVertex: string;
  solidFragment: string;
  solidVertex: string;
  texturedFragment: string;
  texturedVertex: string;
};

export type RenderOptions = {
  showSelectionOutline: boolean;
};

export class Renderer {
  private readonly gl: WebGLRenderingContext;
  private readonly solidColorShaderProgram: SolidColorShaderProgram;
  private readonly checkerboardShaderProgram: CheckerboardShaderProgram;
  private readonly texturedShaderProgram: TexturedShaderProgram;
  private readonly textureManager: TextureManager;
  private readonly quad: Quad;
  private width = 0;
  private height = 0;
  private cssWidth = 1;
  private cssHeight = 1;

  static async create(canvas: HTMLCanvasElement) {
    const [
      checkerboardFragment,
      checkerboardVertex,
      solidFragment,
      solidVertex,
      texturedFragment,
      texturedVertex
    ] = await Promise.all([
      loadShaderSource("/glsl/checkerboard.frag.glsl"),
      loadShaderSource("/glsl/checkerboard.vert.glsl"),
      loadShaderSource("/glsl/solid.frag.glsl"),
      loadShaderSource("/glsl/solid.vert.glsl"),
      loadShaderSource("/glsl/textured.frag.glsl"),
      loadShaderSource("/glsl/textured.vert.glsl")
    ]);

    return new Renderer(canvas, {
      checkerboardFragment,
      checkerboardVertex,
      solidFragment,
      solidVertex,
      texturedFragment,
      texturedVertex
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
    this.texturedShaderProgram = new TexturedShaderProgram(
      gl,
      shaderSources.texturedVertex,
      shaderSources.texturedFragment
    );
    this.textureManager = new TextureManager(gl);
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

  render(scene: Scene, camera: Camera2D, options: RenderOptions) {
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

      if (layer instanceof ImageLayer) {
        this.texturedShaderProgram.use();
        this.texturedShaderProgram.setProjection(camera.projectionMatrix);
        this.texturedShaderProgram.setTextureUnit(0);
        this.texturedShaderProgram.setOpacity(layer.opacity);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureManager.getTexture(layer));
        this.quad.drawTextured(layer, this.texturedShaderProgram);
        this.solidColorShaderProgram.use();
        this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
      }
    }

    const selectedLayer = scene.selectedLayerId ? scene.getLayer(scene.selectedLayerId) : null;

    if (options.showSelectionOutline && selectedLayer?.visible && selectedLayer.opacity > 0) {
      this.drawSelectionOutline(selectedLayer, camera);
    }
  }

  dispose() {
    this.quad.dispose();
    this.textureManager.dispose();
    this.texturedShaderProgram.dispose();
    this.checkerboardShaderProgram.dispose();
    this.solidColorShaderProgram.dispose();
  }

  private clear() {
    this.gl.clearColor(0.07, 0.08, 0.09, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  private drawSelectionOutline(layer: Layer, camera: Camera2D) {
    const corners = getLayerCorners(layer);
    const outlineWidth = Math.max(1.5 / camera.zoom, 0.5);

    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);

    this.drawLine(corners.bottomLeft, corners.bottomRight, outlineWidth);
    this.drawLine(corners.bottomRight, corners.topRight, outlineWidth);
    this.drawLine(corners.topRight, corners.topLeft, outlineWidth);
    this.drawLine(corners.topLeft, corners.bottomLeft, outlineWidth);

    if (!layer.locked) {
      this.drawTransformHandles(layer, camera);
    }
  }

  private drawTransformHandles(layer: Layer, camera: Camera2D) {
    const handleSize = 10 / camera.zoom;
    const rotationHandleSize = 12 / camera.zoom;
    const corners = getLayerCorners(layer);
    const topCenter = midpoint(corners.topLeft, corners.topRight);
    const handles = getTransformHandles(layer, camera);
    const rotationHandle = handles.find((handle) => handle.id === "rotate");

    if (rotationHandle) {
      this.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 0.8]);
      this.drawLine(topCenter, rotationHandle, Math.max(1 / camera.zoom, 0.4));
    }

    for (const handle of handles) {
      const size = handle.id === "rotate" ? rotationHandleSize : handleSize;

      this.solidColorShaderProgram.setColor(
        handle.id === "rotate" ? [0.94, 0.78, 0.36, 1] : [0.07, 0.08, 0.09, 1]
      );
      this.quad.draw(
        {
          x: handle.x - size / 2,
          y: handle.y - size / 2,
          width: size,
          height: size
        },
        this.solidColorShaderProgram
      );

      this.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);
      this.quad.draw(
        {
          x: handle.x - size / 2,
          y: handle.y - size / 2,
          width: size,
          height: Math.max(1 / camera.zoom, 0.4)
        },
        this.solidColorShaderProgram
      );
      this.quad.draw(
        {
          x: handle.x - size / 2,
          y: handle.y + size / 2 - Math.max(1 / camera.zoom, 0.4),
          width: size,
          height: Math.max(1 / camera.zoom, 0.4)
        },
        this.solidColorShaderProgram
      );
      this.quad.draw(
        {
          x: handle.x - size / 2,
          y: handle.y - size / 2,
          width: Math.max(1 / camera.zoom, 0.4),
          height: size
        },
        this.solidColorShaderProgram
      );
      this.quad.draw(
        {
          x: handle.x + size / 2 - Math.max(1 / camera.zoom, 0.4),
          y: handle.y - size / 2,
          width: Math.max(1 / camera.zoom, 0.4),
          height: size
        },
        this.solidColorShaderProgram
      );
    }
  }

  private drawLine(start: { x: number; y: number }, end: { x: number; y: number }, width: number) {
    const center = midpoint(start, end);
    const length = distance(start, end);
    const rotation = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;

    this.quad.draw(
      {
        x: center.x - length / 2,
        y: center.y - width / 2,
        width: length,
        height: width,
        rotation
      },
      this.solidColorShaderProgram
    );
  }
}
