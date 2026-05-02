import { Camera2D } from "../geometry/Camera2D";
import { Scene } from "../scene/Scene";
import {
  distance,
  getLayerCorners,
  getModelMatrix,
  getTransformHandles,
  midpoint
} from "../geometry/TransformGeometry";
import { ImageLayer } from "../layers/ImageLayer";
import { AdjustmentLayer } from "../layers/AdjustmentLayer";
import { defaultLayerFilters, Layer } from "../layers/Layer";
import type { LayerFilterSettings } from "../layers/Layer";
import { GroupLayer } from "../layers/GroupLayer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { StrokeLayer } from "../layers/StrokeLayer";
import { TextLayer } from "../layers/TextLayer";
import { CheckerboardShaderProgram } from "./shaders/CheckerboardShaderProgram";
import { BrushShaderProgram } from "./shaders/BrushShaderProgram";
import { loadShaderSource } from "./shaders/loadShaderSource";
import { PostProcessShaderProgram } from "./shaders/PostProcessShaderProgram";
import type { BlurRegion } from "./shaders/PostProcessShaderProgram";
import { Quad } from "./geometry/Quad";
import { EllipseMesh } from "./geometry/EllipseMesh";
import { SolidColorShaderProgram } from "./shaders/SolidColorShaderProgram";
import { TexturedShaderProgram } from "./shaders/TexturedShaderProgram";
import { TextureManager } from "./textures/TextureManager";
import { SelectionOverlayRenderer } from "./selection/SelectionOverlayRenderer";
import type { BitmapTextRect } from "./text/BitmapText";
import { FontLoader } from "./text/FontLoader";
import { renderImageLayer } from "./layers/renderImageLayer";
import { renderShapeLayer } from "./layers/renderShapeLayer";
import { renderStrokeLayer } from "./layers/renderStrokeLayer";
import { renderTextLayer } from "./layers/renderTextLayer";
import {
  drawLayerLocalCircle as drawLayerLocalCirclePrimitive,
  drawLayerLocalLine as drawLayerLocalLinePrimitive,
  drawLayerLocalPolygon as drawLayerLocalPolygonPrimitive,
  drawLayerLocalRectangle as drawLayerLocalRectanglePrimitive,
  drawBrushLayerLocalVertexData as drawBrushLayerLocalVertexDataPrimitive,
  drawLayerLocalTriangles as drawLayerLocalTrianglesPrimitive,
  drawLayerLocalVertexData as drawLayerLocalVertexDataPrimitive,
  drawWorldRectangle
} from "./primitives/layerPrimitives";
import { drawWorldLine, renderEditorOverlays } from "./overlays/renderEditorOverlays";
import {
  getEffectiveLayerFilters,
  getTopmostAdjustmentBlurIndex,
  hasAdjustmentBlur
} from "./filters/layerFilters";
import type { EffectiveLayerFilters } from "./filters/layerFilters";
import { getAdjustmentLayerBlurRegion, getFullscreenBlurRegion } from "./blur/blurMath";
import { getDropShadowPasses } from "./renderingHelpers";
import { buildStrokePathGeometry } from "./strokes/strokeGeometry";
import type { CachedStrokePathGeometry } from "./strokes/strokeGeometry";
export type RendererShaderSources = {
  brushFragment: string;
  brushVertex: string;
  checkerboardFragment: string;
  checkerboardVertex: string;
  solidFragment: string;
  solidVertex: string;
  postProcessFragment: string;
  postProcessVertex: string;
  texturedFragment: string;
  texturedVertex: string;
};

export type RenderOptions = {
  documentBackground: "checkerboard" | "transparent" | "white";
  showCanvasBorder: boolean;
  showSelectionOverlay: boolean;
  showSelectionOutline: boolean;
  textEdit?: {
    caretIndex: number;
    layerId: string;
    selectionEnd?: number | null;
    selectionStart?: number | null;
  } | null;
};

type StrokeGeometryCacheEntry = {
  paths: CachedStrokePathGeometry[];
  revision: number;
};

type RenderTarget = {
  framebuffer: WebGLFramebuffer;
  height: number;
  texture: WebGLTexture;
  width: number;
};

export const editorRenderOptions: RenderOptions = {
  documentBackground: "checkerboard",
  showCanvasBorder: true,
  showSelectionOverlay: true,
  showSelectionOutline: true,
  textEdit: null
};

export const imageExportRenderOptions: RenderOptions = {
  documentBackground: "transparent",
  showCanvasBorder: false,
  showSelectionOverlay: false,
  showSelectionOutline: false,
  textEdit: null
};

/**
 * Coordinates the editor's WebGL render pipeline, resource ownership, and scene drawing flow.
 */
export class Renderer {
  private readonly gl: WebGLRenderingContext;
  private readonly solidColorShaderProgram: SolidColorShaderProgram;
  private readonly brushShaderProgram: BrushShaderProgram;
  private readonly checkerboardShaderProgram: CheckerboardShaderProgram;
  private readonly postProcessShaderProgram: PostProcessShaderProgram;
  private readonly texturedShaderProgram: TexturedShaderProgram;
  private readonly textureManager: TextureManager;
  private readonly fontLoader: FontLoader;
  private readonly selectionOverlayRenderer: SelectionOverlayRenderer;
  private readonly quad: Quad;
  private readonly ellipseMesh: EllipseMesh;
  private readonly localRectanglePositionBuffer: WebGLBuffer;
  private readonly localRectangleTexCoordBuffer: WebGLBuffer;
  private readonly textGeometryIndexBuffer: WebGLBuffer;
  private readonly textGeometryPositionBuffer: WebGLBuffer;
  private readonly textGeometryTexCoordBuffer: WebGLBuffer;
  private readonly supportsUint32Indices: boolean;
  private readonly strokeGeometryCache = new WeakMap<StrokeLayer, StrokeGeometryCacheEntry>();
  private activeRenderTarget: RenderTarget | null = null;
  private layerBlurRenderTarget: RenderTarget | null = null;
  private layerSourceRenderTarget: RenderTarget | null = null;
  private postProcessRenderTarget: RenderTarget | null = null;
  private sceneRenderTarget: RenderTarget | null = null;
  private layerRenderOffset = { x: 0, y: 0 };
  private renderColorOverride: [number, number, number, number] | null = null;
  private width = 0;
  private height = 0;
  private cssWidth = 1;
  private cssHeight = 1;

  /**
   * Creates a renderer, compiles shader programs, and loads shared font resources.
   */
  static async create(
    canvas: HTMLCanvasElement,
    options: { alpha?: boolean; premultipliedAlpha?: boolean; preserveDrawingBuffer?: boolean } = {}
  ) {
    const [
      checkerboardFragment,
      checkerboardVertex,
      brushFragment,
      brushVertex,
      solidFragment,
      solidVertex,
      postProcessFragment,
      postProcessVertex,
      texturedFragment,
      texturedVertex,
      fontLoader
    ] = await Promise.all([
      loadShaderSource("/glsl/checkerboard.frag.glsl"),
      loadShaderSource("/glsl/checkerboard.vert.glsl"),
      loadShaderSource("/glsl/brush.frag.glsl"),
      loadShaderSource("/glsl/brush.vert.glsl"),
      loadShaderSource("/glsl/solid.frag.glsl"),
      loadShaderSource("/glsl/solid.vert.glsl"),
      loadShaderSource("/glsl/postprocess.frag.glsl"),
      loadShaderSource("/glsl/postprocess.vert.glsl"),
      loadShaderSource("/glsl/textured.frag.glsl"),
      loadShaderSource("/glsl/textured.vert.glsl"),
      FontLoader.create()
    ]);

    return new Renderer(
      canvas,
      {
        brushFragment,
        brushVertex,
        checkerboardFragment,
        checkerboardVertex,
        solidFragment,
        solidVertex,
        postProcessFragment,
        postProcessVertex,
        texturedFragment,
        texturedVertex
      },
      fontLoader,
      options
    );
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    shaderSources: RendererShaderSources,
    fontLoader: FontLoader,
    options: { alpha?: boolean; premultipliedAlpha?: boolean; preserveDrawingBuffer?: boolean } = {}
  ) {
    const gl = canvas.getContext("webgl", {
      alpha: options.alpha ?? false,
      antialias: true,
      depth: false,
      premultipliedAlpha: options.premultipliedAlpha ?? true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
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
    this.brushShaderProgram = new BrushShaderProgram(
      gl,
      shaderSources.brushVertex,
      shaderSources.brushFragment
    );
    this.checkerboardShaderProgram = new CheckerboardShaderProgram(
      gl,
      shaderSources.checkerboardVertex,
      shaderSources.checkerboardFragment
    );
    this.postProcessShaderProgram = new PostProcessShaderProgram(
      gl,
      shaderSources.postProcessVertex,
      shaderSources.postProcessFragment
    );
    this.texturedShaderProgram = new TexturedShaderProgram(
      gl,
      shaderSources.texturedVertex,
      shaderSources.texturedFragment
    );
    this.textureManager = new TextureManager(gl);
    this.fontLoader = fontLoader;
    this.quad = new Quad(gl);
    this.ellipseMesh = new EllipseMesh(gl);
    const localRectanglePositionBuffer = gl.createBuffer();
    const localRectangleTexCoordBuffer = gl.createBuffer();
    const textGeometryPositionBuffer = gl.createBuffer();
    const textGeometryTexCoordBuffer = gl.createBuffer();
    const textGeometryIndexBuffer = gl.createBuffer();

    if (
      !localRectanglePositionBuffer ||
      !localRectangleTexCoordBuffer ||
      !textGeometryPositionBuffer ||
      !textGeometryTexCoordBuffer ||
      !textGeometryIndexBuffer
    ) {
      throw new Error("Unable to create local rectangle buffers.");
    }

    this.localRectanglePositionBuffer = localRectanglePositionBuffer;
    this.localRectangleTexCoordBuffer = localRectangleTexCoordBuffer;
    this.textGeometryPositionBuffer = textGeometryPositionBuffer;
    this.textGeometryTexCoordBuffer = textGeometryTexCoordBuffer;
    this.textGeometryIndexBuffer = textGeometryIndexBuffer;
    this.supportsUint32Indices = Boolean(gl.getExtension("OES_element_index_uint"));
    this.selectionOverlayRenderer = new SelectionOverlayRenderer(
      this.solidColorShaderProgram,
      this.quad
    );
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFuncSeparate(
      this.gl.SRC_ALPHA,
      this.gl.ONE_MINUS_SRC_ALPHA,
      this.gl.ONE,
      this.gl.ONE_MINUS_SRC_ALPHA
    );
  }

  /**
   * Resizes the backing canvas and viewport to the current CSS pixel size.
   */
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

  /**
   * Renders the active scene into the main canvas using the current canvas size.
   */
  render(scene: Scene, camera: Camera2D, options: RenderOptions) {
    this.resize();
    camera.resize(this.cssWidth, this.cssHeight);
    this.renderScene(scene, camera, options);
  }

  /**
   * Renders the scene into the canvas using an explicit output size, primarily for export.
   */
  renderToSize(scene: Scene, camera: Camera2D, options: RenderOptions, width: number, height: number) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.cssWidth = this.width;
    this.cssHeight = this.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.gl.viewport(0, 0, this.width, this.height);
    camera.resize(this.cssWidth, this.cssHeight);
    this.renderScene(scene, camera, options);
  }

  private renderScene(scene: Scene, camera: Camera2D, options: RenderOptions) {
    this.bindRenderTarget(null);

    if (hasAdjustmentBlur(scene.layers)) {
      this.renderArtworkWithStackPostProcess(scene, camera, options);
      this.drawEditorOverlays(scene, camera, options);
      return;
    }

    this.clear(options);

    this.drawArtwork(scene, camera, options);
    this.drawEditorOverlays(scene, camera, options);
  }

  private drawArtwork(scene: Scene, camera: Camera2D, options: RenderOptions) {
    this.drawDocumentBackground(scene, camera, options);
    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setFilters(defaultLayerFilters);
    this.solidColorShaderProgram.setAdjustmentFilters([]);

    const effectiveFilters = getEffectiveLayerFilters(scene.layers);

    for (let layerIndex = 0; layerIndex < scene.layers.length; layerIndex += 1) {
      const layer = scene.layers[layerIndex];

      if (!effectiveFilters[layerIndex].visible || !layer.visible || layer.opacity <= 0) {
        continue;
      }

      if (layer instanceof GroupLayer) {
        continue;
      }

      if (layer instanceof AdjustmentLayer) {
        continue;
      }

      this.drawLayerDropShadow(
        layer,
        camera,
        effectiveFilters[layerIndex].filters,
        effectiveFilters[layerIndex].opacity
      );
      this.drawLayerContent(layer, camera, options.textEdit, effectiveFilters[layerIndex]);
    }
  }

  private drawEditorOverlays(scene: Scene, camera: Camera2D, options: RenderOptions) {
    renderEditorOverlays(
      {
        quad: this.quad,
        selectionOverlayRenderer: this.selectionOverlayRenderer,
        solidColorShaderProgram: this.solidColorShaderProgram,
        drawWorldRectangle: this.drawRectangle.bind(this),
        drawWorldLine: this.drawLine.bind(this)
      },
      scene,
      camera,
      options
    );
  }

  private renderArtworkWithPostProcess(
    scene: Scene,
    camera: Camera2D,
    options: RenderOptions,
    blurRegions: BlurRegion[]
  ) {
    const renderTarget = this.ensureSceneRenderTarget();

    this.bindRenderTarget(renderTarget);
    this.clear(options);
    this.drawArtwork(scene, camera, options);

    this.bindRenderTarget(null);
    this.drawPostProcessedTexture(renderTarget.texture, blurRegions, camera);
  }

  private renderArtworkWithStackPostProcess(scene: Scene, camera: Camera2D, options: RenderOptions) {
    let currentTarget = this.ensureSceneRenderTarget();
    let nextTarget = this.ensurePostProcessRenderTarget();
    const effectiveFilters = getEffectiveLayerFilters(scene.layers);
    const topmostBlurAdjustmentIndex = getTopmostAdjustmentBlurIndex(scene.layers);

    this.bindRenderTarget(currentTarget);
    this.clearTransparent();
    if (options.documentBackground === "white") {
      this.drawDocumentBackground(scene, camera, options);
    }
    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setFilters(defaultLayerFilters);
    this.solidColorShaderProgram.setAdjustmentFilters([]);

    for (let layerIndex = 0; layerIndex <= topmostBlurAdjustmentIndex; layerIndex += 1) {
      const layer = scene.layers[layerIndex];

      if (!effectiveFilters[layerIndex].visible || !layer.visible || layer.opacity <= 0) {
        continue;
      }

      if (layer instanceof GroupLayer) {
        continue;
      }

      if (layer instanceof AdjustmentLayer) {
        const blurRegion = getAdjustmentLayerBlurRegion(
          layer,
          camera,
          this.cssWidth,
          this.cssHeight,
          this.width
        );

        if (!blurRegion) {
          continue;
        }

        this.bindRenderTarget(nextTarget);
        this.clearTransparent();
        this.drawPostProcessedTexture(currentTarget.texture, [blurRegion], camera);
        [currentTarget, nextTarget] = [nextTarget, currentTarget];
        this.bindRenderTarget(currentTarget);
        continue;
      }

      this.drawLayerDropShadow(
        layer,
        camera,
        effectiveFilters[layerIndex].filters,
        effectiveFilters[layerIndex].opacity
      );
      this.drawLayerContent(layer, camera, options.textEdit, effectiveFilters[layerIndex]);
    }

    this.bindRenderTarget(null);
    this.clear(options);
    this.drawDocumentBackground(scene, camera, options);
    this.drawPostProcessedTexture(currentTarget.texture, [], camera, {
      blend: true,
      filter: "nearest"
    });

    for (
      let layerIndex = topmostBlurAdjustmentIndex + 1;
      layerIndex < scene.layers.length;
      layerIndex += 1
    ) {
      const layer = scene.layers[layerIndex];

      if (
        !effectiveFilters[layerIndex].visible ||
        !layer.visible ||
        layer.opacity <= 0 ||
        layer instanceof AdjustmentLayer ||
        layer instanceof GroupLayer
      ) {
        continue;
      }

      this.drawLayerDropShadow(
        layer,
        camera,
        effectiveFilters[layerIndex].filters,
        effectiveFilters[layerIndex].opacity
      );
      this.drawLayerContent(layer, camera, options.textEdit, effectiveFilters[layerIndex]);
    }
  }

  /**
   * Releases all WebGL resources owned by the renderer.
   */
  dispose() {
    this.quad.dispose();
    this.textureManager.dispose();
    this.texturedShaderProgram.dispose();
    this.postProcessShaderProgram.dispose();
    this.checkerboardShaderProgram.dispose();
    this.brushShaderProgram.dispose();
    this.solidColorShaderProgram.dispose();
    this.ellipseMesh.dispose();
    this.gl.deleteBuffer(this.localRectanglePositionBuffer);
    this.gl.deleteBuffer(this.localRectangleTexCoordBuffer);
    this.gl.deleteBuffer(this.textGeometryPositionBuffer);
    this.gl.deleteBuffer(this.textGeometryTexCoordBuffer);
    this.gl.deleteBuffer(this.textGeometryIndexBuffer);
    this.disposeRenderTarget(this.postProcessRenderTarget);
    this.disposeRenderTarget(this.sceneRenderTarget);
    this.disposeRenderTarget(this.layerBlurRenderTarget);
    this.disposeRenderTarget(this.layerSourceRenderTarget);
  }

  private drawPostProcessedTexture(
    texture: WebGLTexture,
    blurRegions: BlurRegion[],
    camera: Camera2D,
    options: {
      backgroundMode?: RenderOptions["documentBackground"];
      blend?: boolean;
      clipToBlurRegions?: boolean;
      cssHeight?: number;
      cssWidth?: number;
      filter?: "linear" | "nearest";
      premultipliedBlend?: boolean;
      textureHeight?: number;
      textureWidth?: number;
    } = {}
  ) {
    if (options.blend) {
      this.gl.enable(this.gl.BLEND);
      if (options.premultipliedBlend) {
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
      }
    } else {
      this.gl.disable(this.gl.BLEND);
    }
    this.postProcessShaderProgram.use();
    this.postProcessShaderProgram.setTextureUnit(0);
    this.postProcessShaderProgram.setTextureSize(
      options.textureWidth ?? this.width,
      options.textureHeight ?? this.height
    );
    this.postProcessShaderProgram.setViewport(
      camera.x,
      camera.y,
      camera.zoom,
      options.cssWidth ?? this.cssWidth,
      options.cssHeight ?? this.cssHeight
    );
    this.postProcessShaderProgram.setBlurRegions(blurRegions);
    this.postProcessShaderProgram.setClipToBlurRegions(Boolean(options.clipToBlurRegions));
    this.postProcessShaderProgram.setReplacementBackground(
      options.backgroundMode ?? "transparent",
      [0.22, 0.23, 0.25, 1],
      [0.31, 0.32, 0.35, 1],
      24
    );
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    if (options.filter === "nearest") {
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    }
    this.quad.drawTextured(this.postProcessShaderProgram);
    if (options.filter === "nearest") {
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    }
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFuncSeparate(
      this.gl.SRC_ALPHA,
      this.gl.ONE_MINUS_SRC_ALPHA,
      this.gl.ONE,
      this.gl.ONE_MINUS_SRC_ALPHA
    );
  }

  private ensureSceneRenderTarget() {
    if (
      this.sceneRenderTarget &&
      this.sceneRenderTarget.width === this.width &&
      this.sceneRenderTarget.height === this.height
    ) {
      return this.sceneRenderTarget;
    }

    this.disposeRenderTarget(this.sceneRenderTarget);
    this.sceneRenderTarget = this.createRenderTarget(this.width, this.height);

    return this.sceneRenderTarget;
  }

  private ensureLayerRenderTargets(width: number, height: number) {
    if (
      this.layerSourceRenderTarget &&
      this.layerBlurRenderTarget &&
      this.layerSourceRenderTarget.width === width &&
      this.layerSourceRenderTarget.height === height &&
      this.layerBlurRenderTarget.width === width &&
      this.layerBlurRenderTarget.height === height
    ) {
      return {
        blur: this.layerBlurRenderTarget,
        source: this.layerSourceRenderTarget
      };
    }

    this.disposeRenderTarget(this.layerSourceRenderTarget);
    this.disposeRenderTarget(this.layerBlurRenderTarget);
    this.layerSourceRenderTarget = this.createRenderTarget(width, height);
    this.layerBlurRenderTarget = this.createRenderTarget(width, height);

    return {
      blur: this.layerBlurRenderTarget,
      source: this.layerSourceRenderTarget
    };
  }

  private ensurePostProcessRenderTarget() {
    if (
      this.postProcessRenderTarget &&
      this.postProcessRenderTarget.width === this.width &&
      this.postProcessRenderTarget.height === this.height
    ) {
      return this.postProcessRenderTarget;
    }

    this.disposeRenderTarget(this.postProcessRenderTarget);
    this.postProcessRenderTarget = this.createRenderTarget(this.width, this.height);

    return this.postProcessRenderTarget;
  }

  private bindRenderTarget(renderTarget: RenderTarget | null) {
    this.activeRenderTarget = renderTarget;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, renderTarget?.framebuffer ?? null);
    this.gl.viewport(0, 0, renderTarget?.width ?? this.width, renderTarget?.height ?? this.height);
  }

  private createRenderTarget(width: number, height: number): RenderTarget {
    const framebuffer = this.gl.createFramebuffer();
    const texture = this.gl.createTexture();

    if (!framebuffer || !texture) {
      throw new Error("Unable to create WebGL post-process render target.");
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null
    );

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      texture,
      0
    );

    if (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE) {
      this.gl.deleteFramebuffer(framebuffer);
      this.gl.deleteTexture(texture);
      throw new Error("WebGL post-process framebuffer is incomplete.");
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

    return { framebuffer, height, texture, width };
  }

  private disposeRenderTarget(renderTarget: RenderTarget | null) {
    if (!renderTarget) {
      return;
    }

    this.gl.deleteFramebuffer(renderTarget.framebuffer);
    this.gl.deleteTexture(renderTarget.texture);
  }

  private clear(options: RenderOptions) {
    if (options.documentBackground === "transparent") {
      this.gl.clearColor(0, 0, 0, 0);
    } else {
      this.gl.clearColor(0.07, 0.08, 0.09, 1);
    }

    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  private clearTransparent() {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  private drawDocumentBackground(scene: Scene, camera: Camera2D, options: RenderOptions) {
    if (options.documentBackground === "transparent") {
      return;
    }

    if (options.documentBackground === "white") {
      this.solidColorShaderProgram.use();
      this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
      this.solidColorShaderProgram.setFilters(defaultLayerFilters);
      this.solidColorShaderProgram.setAdjustmentFilters([]);
      this.solidColorShaderProgram.setColor([1, 1, 1, 1]);
      this.drawRectangle(scene.document);
      return;
    }

    this.checkerboardShaderProgram.use();
    this.checkerboardShaderProgram.setProjection(camera.projectionMatrix);
    this.checkerboardShaderProgram.setModel(getModelMatrix(scene.document));
    this.checkerboardShaderProgram.setCheckerboard(
      [0.22, 0.23, 0.25, 1],
      [0.31, 0.32, 0.35, 1],
      24
    );
    this.quad.draw(this.checkerboardShaderProgram);
  }

  private bindMask(
    layer: Layer,
    shaderProgram: BrushShaderProgram | SolidColorShaderProgram | TexturedShaderProgram
  ) {
    const mask = layer.mask;
    const isMaskEnabled = Boolean(mask?.enabled);

    shaderProgram.setMaskEnabled(isMaskEnabled);
    shaderProgram.setMaskTextureUnit(1);

    if (!mask || !isMaskEnabled) {
      return;
    }

    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureManager.getMaskTexture(mask));
  }

  private bindMaskToProgram(
    layer: Layer,
    shaderProgram: { setMaskEnabled(enabled: boolean): void; setMaskTextureUnit(unit: number): void }
  ) {
    this.bindMask(
      layer,
      shaderProgram as BrushShaderProgram | SolidColorShaderProgram | TexturedShaderProgram
    );
  }

  private drawRectangle(rectangle: {
    height: number;
    rotation?: number;
    width: number;
    x: number;
    y: number;
  }) {
    drawWorldRectangle(
      {
        solidColorShaderProgram: this.solidColorShaderProgram
      },
      rectangle
    );
    this.quad.drawTextured(this.solidColorShaderProgram);
  }

  private drawLine(start: { x: number; y: number }, end: { x: number; y: number }, width: number) {
    drawWorldLine(this.drawRectangle.bind(this), start, end, width);
  }

  private drawLayerContent(
    layer: Layer,
    camera: Camera2D,
    textEdit: RenderOptions["textEdit"],
    filters: EffectiveLayerFilters
  ) {
    if (filters.filters.blur <= 0.5) {
      this.drawLayerContentDirect(layer, camera, textEdit, filters);
      return;
    }

    const blurPass = this.createIsolatedLayerBlurPass(layer, filters.filters.blur);
    const blurRegion = getFullscreenBlurRegion(
      blurPass.camera,
      blurPass.cssWidth,
      blurPass.cssHeight,
      blurPass.textureWidth,
      filters.filters.blur
    );

    if (!blurRegion) {
      this.drawLayerContentDirect(layer, camera, textEdit, filters);
      return;
    }

    const renderTargets = this.ensureLayerRenderTargets(blurPass.textureWidth, blurPass.textureHeight);
    const previousTarget = this.activeRenderTarget;

    this.bindRenderTarget(renderTargets.source);
    this.clearTransparent();
    this.drawLayerContentDirect(layer, blurPass.camera, textEdit, {
      adjustments: [],
      filters: {
        ...filters.filters,
        blur: 0
      },
      opacity: filters.opacity,
      visible: filters.visible
    });
    this.bindRenderTarget(renderTargets.blur);
    this.clearTransparent();
    this.drawPostProcessedTexture(renderTargets.source.texture, [blurRegion], blurPass.camera, {
      cssHeight: blurPass.cssHeight,
      cssWidth: blurPass.cssWidth,
      textureHeight: blurPass.textureHeight,
      textureWidth: blurPass.textureWidth
    });
    this.bindRenderTarget(previousTarget);
    this.drawTextureQuad(renderTargets.blur.texture, blurPass.bounds, camera, {
      adjustments: filters.adjustments,
      textureHeight: blurPass.textureHeight,
      textureWidth: blurPass.textureWidth
    });
  }

  private drawLayerContentDirect(
    layer: Layer,
    camera: Camera2D,
    textEdit: RenderOptions["textEdit"],
    filters: EffectiveLayerFilters
  ) {
    if (layer instanceof ShapeLayer) {
      renderShapeLayer(
        {
          ellipseMesh: this.ellipseMesh,
          quad: this.quad,
          solidColorShaderProgram: this.solidColorShaderProgram,
          bindMask: this.bindMaskToProgram.bind(this),
          drawLayerLocalLine: this.drawLayerLocalLine.bind(this),
          drawLayerLocalPolygon: this.drawLayerLocalPolygon.bind(this),
          drawLayerLocalRectangle: this.drawLayerLocalRectangle.bind(this),
          getLayerModelMatrix: this.getLayerModelMatrix.bind(this),
          getRenderColor: this.getRenderColor.bind(this)
        },
        layer,
        camera,
        filters
      );
    }

    if (layer instanceof StrokeLayer) {
      renderStrokeLayer(
        {
          brushShaderProgram: this.brushShaderProgram,
          bindMask: this.bindMaskToProgram.bind(this),
          drawBrushLayerLocalVertexData: this.drawBrushLayerLocalVertexData.bind(this),
          getRenderColor: this.getRenderColor.bind(this),
          getStrokeGeometry: this.getStrokeGeometry.bind(this)
        },
        layer,
        camera,
        filters
      );
    }

    if (layer instanceof ImageLayer) {
      renderImageLayer(
        {
          gl: this.gl,
          quad: this.quad,
          solidColorShaderProgram: this.solidColorShaderProgram,
          texturedShaderProgram: this.texturedShaderProgram,
          textureManager: this.textureManager,
          bindMask: this.bindMaskToProgram.bind(this),
          getLayerModelMatrix: this.getLayerModelMatrix.bind(this),
          renderColorOverride: this.renderColorOverride
        },
        layer,
        camera,
        filters
      );
    }

    if (layer instanceof TextLayer) {
      renderTextLayer(
        {
          gl: this.gl,
          fontLoader: this.fontLoader,
          solidColorShaderProgram: this.solidColorShaderProgram,
          supportsUint32Indices: this.supportsUint32Indices,
          textGeometryIndexBuffer: this.textGeometryIndexBuffer,
          textGeometryPositionBuffer: this.textGeometryPositionBuffer,
          textGeometryTexCoordBuffer: this.textGeometryTexCoordBuffer,
          bindMask: this.bindMaskToProgram.bind(this),
          drawLayerLocalRectangle: this.drawLayerLocalRectangle.bind(this),
          getLayerModelMatrix: this.getLayerModelMatrix.bind(this),
          getRenderColor: this.getRenderColor.bind(this)
        },
        layer,
        camera,
        textEdit,
        filters
      );
    }
  }

  private drawLayerDropShadow(
    layer: Layer,
    camera: Camera2D,
    filters: LayerFilterSettings,
    opacityMultiplier = 1
  ) {
    if (filters.dropShadowOpacity <= 0) {
      return;
    }

    const shadowFilters = {
      ...defaultLayerFilters,
      blur: Math.max(filters.blur, filters.dropShadowBlur)
    };
    const passes = getDropShadowPasses(filters);
    const previousOverride = this.renderColorOverride;

    try {
      for (const pass of passes) {
        this.renderColorOverride = [
          0,
          0,
          0,
          filters.dropShadowOpacity * pass.opacity * opacityMultiplier
        ];
        this.withLayerRenderOffset(
          {
            x: filters.dropShadowOffsetX + pass.x,
            y: filters.dropShadowOffsetY + pass.y
          },
          () => this.drawLayerContent(layer, camera, null, {
            adjustments: [],
            filters: shadowFilters,
            opacity: opacityMultiplier,
            visible: true
          })
        );
      }
    } finally {
      this.renderColorOverride = previousOverride;
    }
  }

  private getRenderColor(
    color: [number, number, number, number],
    opacity: number
  ): [number, number, number, number] {
    if (!this.renderColorOverride) {
      return [color[0], color[1], color[2], color[3] * opacity];
    }

    return [
      this.renderColorOverride[0],
      this.renderColorOverride[1],
      this.renderColorOverride[2],
      color[3] * opacity * this.renderColorOverride[3]
    ];
  }

  private getLayerModelMatrix(layer: Layer) {
    if (this.layerRenderOffset.x === 0 && this.layerRenderOffset.y === 0) {
      return getModelMatrix(layer);
    }

    return getModelMatrix({
      ...layer,
      x: layer.x + this.layerRenderOffset.x,
      y: layer.y + this.layerRenderOffset.y
    });
  }

  private withLayerRenderOffset(offset: { x: number; y: number }, draw: () => void) {
    const previousOffset = this.layerRenderOffset;

    this.layerRenderOffset = {
      x: previousOffset.x + offset.x,
      y: previousOffset.y + offset.y
    };

    try {
      draw();
    } finally {
      this.layerRenderOffset = previousOffset;
    }
  }

  private getStrokeGeometry(layer: StrokeLayer) {
    const cachedGeometry = this.strokeGeometryCache.get(layer);

    if (cachedGeometry?.revision === layer.revision) {
      return cachedGeometry;
    }

    const nextGeometry: StrokeGeometryCacheEntry = {
      paths: layer.paths.map((path) => buildStrokePathGeometry(layer, path)),
      revision: layer.revision
    };

    this.strokeGeometryCache.set(layer, nextGeometry);

    return nextGeometry;
  }

  private drawLayerLocalRectangle(
    layer: Layer,
    rectangle: {
      height: number;
      width: number;
      x: number;
      y: number;
    },
    maskFrame?: BitmapTextRect
  ) {
    drawLayerLocalRectanglePrimitive(this.getPrimitiveRendererContext(), layer, rectangle, maskFrame);
  }

  private drawLayerLocalPolygon(layer: Layer, points: Array<{ x: number; y: number }>) {
    drawLayerLocalPolygonPrimitive(this.getPrimitiveRendererContext(), layer, points);
  }

  private drawLayerLocalLine(
    layer: Layer,
    start: { x: number; y: number },
    end: { x: number; y: number },
    width: number
  ) {
    drawLayerLocalLinePrimitive(this.getPrimitiveRendererContext(), layer, start, end, width);
  }


  private drawLayerLocalCircle(layer: Layer, center: { x: number; y: number }, radius: number) {
    drawLayerLocalCirclePrimitive(this.getPrimitiveRendererContext(), layer, center, radius);
  }

  private drawLayerLocalTriangles(layer: Layer, points: Array<{ x: number; y: number }>) {
    drawLayerLocalTrianglesPrimitive(this.getPrimitiveRendererContext(), layer, points);
  }

  private drawLayerLocalVertexData(
    layer: Layer,
    vertices: Float32Array,
    texCoords: Float32Array
  ) {
    drawLayerLocalVertexDataPrimitive(this.getPrimitiveRendererContext(), layer, vertices, texCoords);
  }

  private drawBrushLayerLocalVertexData(
    layer: Layer,
    vertices: Float32Array,
    texCoords: Float32Array
  ) {
    drawBrushLayerLocalVertexDataPrimitive(
      this.getPrimitiveRendererContext(),
      layer,
      vertices,
      texCoords
    );
  }

  private getPrimitiveRendererContext() {
    return {
      gl: this.gl,
      brushShaderProgram: this.brushShaderProgram,
      solidColorShaderProgram: this.solidColorShaderProgram,
      localRectanglePositionBuffer: this.localRectanglePositionBuffer,
      localRectangleTexCoordBuffer: this.localRectangleTexCoordBuffer,
      getLayerModelMatrix: this.getLayerModelMatrix.bind(this)
    };
  }

  private drawTextureQuad(
    texture: WebGLTexture,
    bounds: [number, number, number, number],
    camera: Camera2D,
    options: {
      adjustments?: EffectiveLayerFilters["adjustments"];
      opacity?: number;
      textureHeight: number;
      textureWidth: number;
    }
  ) {
    this.texturedShaderProgram.use();
    this.texturedShaderProgram.setProjection(camera.projectionMatrix);
    this.texturedShaderProgram.setModel(
      getModelMatrix({
        height: bounds[3],
        width: bounds[2],
        x: bounds[0],
        y: bounds[1]
      })
    );
    this.texturedShaderProgram.setTextureUnit(0);
    this.texturedShaderProgram.setMaskEnabled(false);
    this.texturedShaderProgram.setMaskTextureUnit(1);
    this.texturedShaderProgram.setOpacity(options.opacity ?? 1);
    this.texturedShaderProgram.setFilters(defaultLayerFilters);
    this.texturedShaderProgram.setAdjustmentFilters(options.adjustments ?? []);
    this.texturedShaderProgram.setTextureSize(options.textureWidth, options.textureHeight);
    this.texturedShaderProgram.setTintEnabled(false);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.quad.drawTextured(this.texturedShaderProgram);
    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setFilters(defaultLayerFilters);
    this.solidColorShaderProgram.setAdjustmentFilters([]);
  }

  private createIsolatedLayerBlurPass(layer: Layer, blur: number) {
    const deviceScale = this.width / Math.max(1, this.cssWidth);
    const baseBounds = this.getLayerWorldBounds(layer);
    const padding = Math.max(2, blur * 2);
    const bounds: [number, number, number, number] = [
      baseBounds[0] - padding,
      baseBounds[1] - padding,
      baseBounds[2] + padding * 2,
      baseBounds[3] + padding * 2
    ];
    const cssWidth = Math.max(1, bounds[2]);
    const cssHeight = Math.max(1, bounds[3]);
    const textureWidth = Math.max(1, Math.ceil(cssWidth * deviceScale));
    const textureHeight = Math.max(1, Math.ceil(cssHeight * deviceScale));
    const blurCamera = new Camera2D();

    blurCamera.x = bounds[0] + bounds[2] / 2;
    blurCamera.y = bounds[1] + bounds[3] / 2;
    blurCamera.zoom = 1;
    blurCamera.resize(cssWidth, cssHeight);

    return {
      bounds,
      camera: blurCamera,
      cssHeight,
      cssWidth,
      textureHeight,
      textureWidth
    };
  }

  private getLayerWorldBounds(layer: Layer): [number, number, number, number] {
    const positionedLayer =
      this.layerRenderOffset.x === 0 && this.layerRenderOffset.y === 0
        ? layer
        : {
            ...layer,
            x: layer.x + this.layerRenderOffset.x,
            y: layer.y + this.layerRenderOffset.y
          };
    const corners = getLayerCorners(positionedLayer as Layer);
    const xs = [
      corners.topLeft.x,
      corners.topRight.x,
      corners.bottomRight.x,
      corners.bottomLeft.x
    ];
    const ys = [
      corners.topLeft.y,
      corners.topRight.y,
      corners.bottomRight.y,
      corners.bottomLeft.y
    ];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return [minX, minY, maxX - minX, maxY - minY];
  }

  /**
   * Preloads fonts referenced by text layers before export or offscreen rendering.
   */
  async prepareSceneFonts(scene: Scene) {
    const tasks: Promise<unknown>[] = [];

    for (const layer of scene.layers) {
      if (layer instanceof TextLayer) {
        tasks.push(
          this.fontLoader.ensureFont(
            layer.fontFamily,
            layer.bold,
            layer.italic
          )
        );
      }
    }

    await Promise.all(tasks);
  }
}
