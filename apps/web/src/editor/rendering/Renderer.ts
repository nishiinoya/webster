import { Camera2D } from "../geometry/Camera2D";
import { invert3x3, transformPoint3x3 } from "../geometry/Matrix3";
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
import type { LayerFilterAdjustment, LayerFilterSettings } from "../layers/Layer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { StrokeLayer } from "../layers/StrokeLayer";
import type { StrokePath, StrokeSelectionClip, StrokeStyle } from "../layers/StrokeLayer";
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
import { layoutBitmapText } from "./text/BitmapText";
import type { BitmapTextRect } from "./text/BitmapText";
import { FontLoader } from "./text/FontLoader";
import { buildCompiledTextGeometry } from "./text/CompiledTextGeometry";
import type { CompiledTextGeometry, TextCharacterBox } from "./text/CompiledTextGeometry";
import earcut from "earcut";

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

type StrokeMeshVertex = {
  x: number;
  y: number;
  u: number;
  v: number;
};

type CachedStrokePathGeometry = {
  brushSize: number;
  brushStyle: number;
  color: [number, number, number, number];
  selectionClip: StrokeSelectionClip | null;
  texCoords: Float32Array;
  vertices: Float32Array;
};

type StrokeGeometryCacheEntry = {
  paths: CachedStrokePathGeometry[];
  revision: number;
};

type EffectiveLayerFilters = {
  adjustments: LayerFilterAdjustment[];
  filters: LayerFilterSettings;
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
  private postProcessRenderTarget: RenderTarget | null = null;
  private sceneRenderTarget: RenderTarget | null = null;
  private layerRenderOffset = { x: 0, y: 0 };
  private renderColorOverride: [number, number, number, number] | null = null;
  private width = 0;
  private height = 0;
  private cssWidth = 1;
  private cssHeight = 1;

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
    this.renderScene(scene, camera, options);
  }

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

      if (!layer.visible || layer.opacity <= 0) {
        continue;
      }

      if (layer instanceof AdjustmentLayer) {
        continue;
      }

      this.drawLayerDropShadow(layer, camera, effectiveFilters[layerIndex].filters);
      this.drawLayerContent(layer, camera, options.textEdit, effectiveFilters[layerIndex]);
    }
  }

  private drawEditorOverlays(scene: Scene, camera: Camera2D, options: RenderOptions) {
    const selectedLayer = scene.selectedLayerId ? scene.getLayer(scene.selectedLayerId) : null;

    if (options.showCanvasBorder) {
      this.drawCanvasBorder(scene, camera);
    }

    if (options.showSelectionOutline && selectedLayer?.visible && selectedLayer.opacity > 0) {
      this.drawSelectionOutline(selectedLayer, camera);
    }

    const selection = scene.selection.visibleSelection;

    if (options.showSelectionOverlay && selection) {
      this.selectionOverlayRenderer.render(selection, camera, scene.document);
    }
  }

  private drawCanvasBorder(scene: Scene, camera: Camera2D) {
    const document = scene.document;
    const left = document.x;
    const right = document.x + document.width;
    const bottom = document.y;
    const top = document.y + document.height;
    const glowWidth = Math.max(8 / camera.zoom, 1.4);
    const midWidth = Math.max(4 / camera.zoom, 0.9);
    const crispWidth = Math.max(1.5 / camera.zoom, 0.5);

    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setFilters(defaultLayerFilters);
    this.solidColorShaderProgram.setAdjustmentFilters([]);

    this.solidColorShaderProgram.setColor([0.22, 1, 0.82, 0.1]);
    this.drawDocumentBorderLines(left, right, bottom, top, glowWidth);

    this.solidColorShaderProgram.setColor([0.3, 0.95, 0.82, 0.24]);
    this.drawDocumentBorderLines(left, right, bottom, top, midWidth);

    this.solidColorShaderProgram.setColor([0.64, 1, 0.9, 0.86]);
    this.drawDocumentBorderLines(left, right, bottom, top, crispWidth);
  }

  private drawDocumentBorderLines(
    left: number,
    right: number,
    bottom: number,
    top: number,
    width: number
  ) {
    this.drawLine({ x: left, y: bottom }, { x: right, y: bottom }, width);
    this.drawLine({ x: right, y: bottom }, { x: right, y: top }, width);
    this.drawLine({ x: right, y: top }, { x: left, y: top }, width);
    this.drawLine({ x: left, y: top }, { x: left, y: bottom }, width);
  }

  private renderArtworkWithPostProcess(
    scene: Scene,
    camera: Camera2D,
    options: RenderOptions,
    blurRegions: BlurRegion[]
  ) {
    const renderTarget = this.ensureSceneRenderTarget();

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, renderTarget.framebuffer);
    this.gl.viewport(0, 0, renderTarget.width, renderTarget.height);
    this.clear(options);
    this.drawArtwork(scene, camera, options);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.width, this.height);
    this.drawPostProcessedTexture(renderTarget.texture, blurRegions, camera);
  }

  private renderArtworkWithStackPostProcess(scene: Scene, camera: Camera2D, options: RenderOptions) {
    let currentTarget = this.ensureSceneRenderTarget();
    let nextTarget = this.ensurePostProcessRenderTarget();
    const effectiveFilters = getEffectiveLayerFilters(scene.layers);
    const topmostBlurAdjustmentIndex = getTopmostAdjustmentBlurIndex(scene.layers)
    const appliedBlurRegions: BlurRegion[] = [];

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, currentTarget.framebuffer);
    this.gl.viewport(0, 0, currentTarget.width, currentTarget.height);
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

      if (!layer.visible || layer.opacity <= 0) {
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

        appliedBlurRegions.push(blurRegion);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, nextTarget.framebuffer);
        this.gl.viewport(0, 0, nextTarget.width, nextTarget.height);
        this.clearTransparent();
        this.drawPostProcessedTexture(currentTarget.texture, [blurRegion], camera);
        [currentTarget, nextTarget] = [nextTarget, currentTarget];
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, currentTarget.framebuffer);
        this.gl.viewport(0, 0, currentTarget.width, currentTarget.height);
        continue;
      }

      this.drawLayerDropShadow(layer, camera, effectiveFilters[layerIndex].filters);
      this.drawLayerContent(layer, camera, options.textEdit, effectiveFilters[layerIndex]);
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.width, this.height);
    this.clear(options);
    this.drawDocumentBackground(scene, camera, options);
        for (let layerIndex = 0; layerIndex <= topmostBlurAdjustmentIndex; layerIndex += 1) {
      const layer = scene.layers[layerIndex];

      if (!layer.visible || layer.opacity <= 0 || layer instanceof AdjustmentLayer) {
        continue;
      }

      this.drawLayerDropShadow(layer, camera, effectiveFilters[layerIndex].filters);
      this.drawLayerContent(layer, camera, options.textEdit, effectiveFilters[layerIndex]);
    }
    this.drawPostProcessedTexture(currentTarget.texture, toClipOnlyBlurRegions(appliedBlurRegions), camera, {
      blend: true,
      clipToBlurRegions: true,
      filter: "nearest",
      premultipliedBlend: true
    });

    
    for (
      let layerIndex = topmostBlurAdjustmentIndex + 1;
      layerIndex < scene.layers.length;
      layerIndex += 1
    ) {
      const layer = scene.layers[layerIndex];

      if (!layer.visible || layer.opacity <= 0 || layer instanceof AdjustmentLayer) {
        continue;
      }

      this.drawLayerDropShadow(layer, camera, effectiveFilters[layerIndex].filters);
      this.drawLayerContent(layer, camera, options.textEdit, effectiveFilters[layerIndex]);
    }
  }

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
  }

  private drawPostProcessedTexture(
    texture: WebGLTexture,
    blurRegions: BlurRegion[],
    camera: Camera2D,
    options: {
      blend?: boolean;
      clipToBlurRegions?: boolean;
      filter?: "linear" | "nearest";
      premultipliedBlend?: boolean;
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
    this.postProcessShaderProgram.setTextureSize(this.width, this.height);
    this.postProcessShaderProgram.setViewport(
      camera.x,
      camera.y,
      camera.zoom,
      this.cssWidth,
      this.cssHeight
    );
    this.postProcessShaderProgram.setBlurRegions(blurRegions);
    this.postProcessShaderProgram.setClipToBlurRegions(Boolean(options.clipToBlurRegions));
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
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
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

  private drawSelectionOutline(layer: Layer, camera: Camera2D) {
    const corners = getLayerCorners(layer);
    const outlineWidth = Math.max(1.5 / camera.zoom, 0.5);

    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setFilters(defaultLayerFilters);
    this.solidColorShaderProgram.setAdjustmentFilters([]);
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
      this.solidColorShaderProgram.setModel(
        getModelMatrix({
          x: handle.x - size / 2,
          y: handle.y - size / 2,
          width: size,
          height: size
        })
      );
      this.quad.draw(this.solidColorShaderProgram);

      this.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);
      this.drawRectangle({
        x: handle.x - size / 2,
        y: handle.y - size / 2,
        width: size,
        height: Math.max(1 / camera.zoom, 0.4)
      });
      this.drawRectangle({
        x: handle.x - size / 2,
        y: handle.y + size / 2 - Math.max(1 / camera.zoom, 0.4),
        width: size,
        height: Math.max(1 / camera.zoom, 0.4)
      });
      this.drawRectangle({
        x: handle.x - size / 2,
        y: handle.y - size / 2,
        width: Math.max(1 / camera.zoom, 0.4),
        height: size
      });
      this.drawRectangle({
        x: handle.x + size / 2 - Math.max(1 / camera.zoom, 0.4),
        y: handle.y - size / 2,
        width: Math.max(1 / camera.zoom, 0.4),
        height: size
      });
    }
  }

  private drawRectangle(rectangle: {
    height: number;
    rotation?: number;
    width: number;
    x: number;
    y: number;
  }) {
    this.solidColorShaderProgram.setModel(getModelMatrix(rectangle));
    this.solidColorShaderProgram.setMaskEnabled(false);
    this.solidColorShaderProgram.setMaskTextureUnit(1);
    this.quad.drawTextured(this.solidColorShaderProgram);
  }

  private drawLine(start: { x: number; y: number }, end: { x: number; y: number }, width: number) {
    const center = midpoint(start, end);
    const length = distance(start, end);
    const rotation = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;

    this.drawRectangle({
      x: center.x - length / 2,
      y: center.y - width / 2,
      width: length,
      height: width,
      rotation
    });
  }

  private drawLayerContent(
    layer: Layer,
    camera: Camera2D,
    textEdit: RenderOptions["textEdit"],
    filters: EffectiveLayerFilters
  ) {
    if (layer instanceof ShapeLayer) {
      this.drawShapeLayer(layer, camera, filters);
    }

    if (layer instanceof StrokeLayer) {
      this.drawStrokeLayer(layer, camera, filters);
    }

    if (layer instanceof ImageLayer) {
      this.drawImageLayer(layer, camera, filters);
    }

    if (layer instanceof TextLayer) {
      this.drawTextLayer(layer, camera, textEdit, filters);
    }
  }

  private drawLayerDropShadow(layer: Layer, camera: Camera2D, filters: LayerFilterSettings) {
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
        this.renderColorOverride = [0, 0, 0, filters.dropShadowOpacity * pass.opacity];
        this.withLayerRenderOffset(
          {
            x: filters.dropShadowOffsetX + pass.x,
            y: filters.dropShadowOffsetY + pass.y
          },
          () => this.drawLayerContent(layer, camera, null, {
            adjustments: [],
            filters: shadowFilters
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

  private drawImageLayer(layer: ImageLayer, camera: Camera2D, filters: EffectiveLayerFilters) {
    this.texturedShaderProgram.use();
    this.texturedShaderProgram.setProjection(camera.projectionMatrix);
    this.texturedShaderProgram.setModel(this.getLayerModelMatrix(layer));
    this.texturedShaderProgram.setTextureUnit(0);
    this.texturedShaderProgram.setMaskTextureUnit(1);
    this.texturedShaderProgram.setOpacity(layer.opacity);
    this.texturedShaderProgram.setFilters(filters.filters);
    this.texturedShaderProgram.setAdjustmentFilters(filters.adjustments);
    this.texturedShaderProgram.setTextureSize(layer.image.naturalWidth, layer.image.naturalHeight);
    this.texturedShaderProgram.setTintColor(this.renderColorOverride ?? [1, 1, 1, 1]);
    this.texturedShaderProgram.setTintEnabled(Boolean(this.renderColorOverride));
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureManager.getTexture(layer));
    this.bindMask(layer, this.texturedShaderProgram);
    this.quad.drawTextured(this.texturedShaderProgram);
    this.texturedShaderProgram.setTintEnabled(false);
    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setFilters(defaultLayerFilters);
    this.solidColorShaderProgram.setAdjustmentFilters([]);
  }

  private drawShapeLayer(layer: ShapeLayer, camera: Camera2D, filters: EffectiveLayerFilters) {
    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setFilters(filters.filters);
    this.solidColorShaderProgram.setAdjustmentFilters(filters.adjustments);

    if (layer.shape === "rectangle") {
      this.drawRectangleShape(layer);
      return;
    }

    if (layer.shape === "circle") {
      this.drawEllipseShape(layer);
      return;
    }

    if (layer.shape === "line") {
      this.drawLineShape(layer);
      return;
    }

    this.drawPolygonShape(layer);
  }

  private drawStrokeLayer(layer: StrokeLayer, camera: Camera2D, filters: EffectiveLayerFilters) {
    if (layer.paths.length === 0) {
      return;
    }

    const cachedGeometry = this.getStrokeGeometry(layer);

    this.brushShaderProgram.use();
    this.brushShaderProgram.setProjection(camera.projectionMatrix);
    this.brushShaderProgram.setFilters(filters.filters);
    this.brushShaderProgram.setAdjustmentFilters(filters.adjustments);
    this.bindMask(layer, this.brushShaderProgram);

    for (const path of cachedGeometry.paths) {
      this.brushShaderProgram.setColor(this.getRenderColor(path.color, layer.opacity));
      this.brushShaderProgram.setBrushStyle(path.brushStyle);
      this.brushShaderProgram.setBrushSize(path.brushSize);
      this.brushShaderProgram.setSelectionClip(getLayerSelectionClip(layer, path.selectionClip));
      this.drawBrushLayerLocalVertexData(layer, path.vertices, path.texCoords);
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

  private drawPolygonShape(layer: ShapeLayer) {
    const points = getPolygonShapePoints(layer);

    if (points.length < 3) {
      return;
    }

    if (layer.fillColor[3] > 0) {
      this.solidColorShaderProgram.setColor(this.getRenderColor(layer.fillColor, layer.opacity));
      this.bindMask(layer, this.solidColorShaderProgram);
      this.drawLayerLocalPolygon(layer, points);
    }

    if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
      return;
    }

    this.solidColorShaderProgram.setColor(this.getRenderColor(layer.strokeColor, layer.opacity));
    this.bindMask(layer, this.solidColorShaderProgram);

    const strokeWidth =
      layer.strokeWidth / Math.max(1e-6, (Math.abs(layer.scaleX) + Math.abs(layer.scaleY)) / 2);

    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];

      this.drawLayerLocalLine(layer, start, end, strokeWidth);
    }
  }

  private drawRectangleShape(layer: ShapeLayer) {
    if (layer.fillColor[3] > 0) {
      this.solidColorShaderProgram.setColor(this.getRenderColor(layer.fillColor, layer.opacity));
      this.solidColorShaderProgram.setModel(this.getLayerModelMatrix(layer));
      this.bindMask(layer, this.solidColorShaderProgram);
      this.quad.drawTextured(this.solidColorShaderProgram);
    }

      if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
        return;
      }

      this.solidColorShaderProgram.setColor(this.getRenderColor(layer.strokeColor, layer.opacity));
      this.bindMask(layer, this.solidColorShaderProgram);

      const strokeWidthX = Math.min(
        layer.strokeWidth / Math.max(layer.scaleX, 1e-6),
        layer.width / 2
      );
      const strokeWidthY = Math.min(
        layer.strokeWidth / Math.max(layer.scaleY, 1e-6),
        layer.height / 2
      );

      this.drawLayerLocalRectangle(layer, {
        x: 0,
        y: 0,
        width: layer.width,
        height: strokeWidthY
      });

      this.drawLayerLocalRectangle(layer, {
        x: 0,
        y: layer.height - strokeWidthY,
        width: layer.width,
        height: strokeWidthY
      });

      this.drawLayerLocalRectangle(layer, {
        x: 0,
        y: 0,
        width: strokeWidthX,
        height: layer.height
      });

      this.drawLayerLocalRectangle(layer, {
        x: layer.width - strokeWidthX,
        y: 0,
        width: strokeWidthX,
        height: layer.height
      });
  }

  private drawLineShape(layer: ShapeLayer) {
    if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
      return;
    }

    const strokeWidth = Math.min(
      Math.max(1, layer.strokeWidth) / Math.max(layer.scaleY, 1e-6),
      layer.height
    );

    this.solidColorShaderProgram.setColor(this.getRenderColor(layer.strokeColor, layer.opacity));
    this.bindMask(layer, this.solidColorShaderProgram);

    this.drawLayerLocalRectangle(layer, {
      x: 0,
      y: (layer.height - strokeWidth) / 2,
      width: layer.width,
      height: strokeWidth
    });
  }

  private drawEllipseShape(layer: ShapeLayer) {
    if (layer.fillColor[3] > 0) {
      this.solidColorShaderProgram.setColor(this.getRenderColor(layer.fillColor, layer.opacity));
      this.solidColorShaderProgram.setModel(this.getLayerModelMatrix(layer));
      this.bindMask(layer, this.solidColorShaderProgram);
      this.ellipseMesh.drawFill(this.solidColorShaderProgram);
    }

    if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
      return;
    }

    this.solidColorShaderProgram.setColor(this.getRenderColor(layer.strokeColor, layer.opacity));
    this.solidColorShaderProgram.setModel(this.getLayerModelMatrix(layer));
    this.bindMask(layer, this.solidColorShaderProgram);
    this.ellipseMesh.drawStroke(
      this.solidColorShaderProgram,
      Math.max(1, layer.strokeWidth),
      layer.width * layer.scaleX,
      layer.height * layer.scaleY
    );
  }

  private drawTextLayer(
    layer: TextLayer,
    camera: Camera2D,
    textEdit: RenderOptions["textEdit"],
    filters: EffectiveLayerFilters
  ) {
    const requestedCompiledFont = this.fontLoader.requestFont(
      layer.fontFamily,
      layer.bold,
      layer.italic
    );

    const compiledFont = requestedCompiledFont ?? layer.lastResolvedCompiledFont ?? null;

    if (requestedCompiledFont && !requestedCompiledFont.isFallbackWhileLoading) {
      layer.lastResolvedCompiledFont = requestedCompiledFont;
    }

    if (compiledFont) {
      const geometry = buildCompiledTextGeometry(
        layer,
        compiledFont.font,
        textEdit?.layerId === layer.id ? textEdit.caretIndex : layer.text.length,
        {
          synthesizeBold: compiledFont.synthesizeBold,
          synthesizeItalic: compiledFont.synthesizeItalic
        }
      );
      layer.lastTextMaskFrame = geometry.maskFrame;
      layer.lastTextCharacterBoxes = geometry.characterBoxes;

      if (textEdit?.layerId === layer.id) {
        this.drawTextSelection(layer, geometry.characterBoxes, textEdit);
      }

      const didDrawCompiledText = this.drawCompiledTextGeometry(layer, camera, geometry, filters);

      if (didDrawCompiledText && textEdit?.layerId === layer.id) {
        this.solidColorShaderProgram.setMaskEnabled(false);
        this.solidColorShaderProgram.setFilters(defaultLayerFilters);
        this.solidColorShaderProgram.setAdjustmentFilters([]);
        this.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);
        this.drawLayerLocalRectangle(layer, geometry.caret);
      }

      if (didDrawCompiledText && geometry.indices.length > 0) {
        return;
      }
    }

    const layout = layoutBitmapText(
      layer,
      textEdit?.layerId === layer.id ? textEdit.caretIndex : layer.text.length
    );
    layer.lastTextMaskFrame = layout.maskFrame;
    layer.lastTextCharacterBoxes = layout.characterBoxes;

    if (textEdit?.layerId === layer.id) {
      this.solidColorShaderProgram.use();
      this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
      this.solidColorShaderProgram.setFilters(defaultLayerFilters);
      this.solidColorShaderProgram.setAdjustmentFilters([]);
      this.drawTextSelection(layer, layout.characterBoxes, textEdit);
    }

    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setFilters(filters.filters);
    this.solidColorShaderProgram.setAdjustmentFilters(filters.adjustments);
    this.bindMask(layer, this.solidColorShaderProgram);
    this.solidColorShaderProgram.setColor(this.getRenderColor(layer.color, layer.opacity));

    for (const glyph of layout.glyphs) {
      this.drawLayerLocalRectangle(layer, glyph, layout.maskFrame);
    }

    if (textEdit?.layerId !== layer.id) {
      this.solidColorShaderProgram.setMaskEnabled(false);
      return;
    }

    this.solidColorShaderProgram.setMaskEnabled(false);
    this.solidColorShaderProgram.setFilters(defaultLayerFilters);
    this.solidColorShaderProgram.setAdjustmentFilters([]);
    this.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);
    this.drawLayerLocalRectangle(layer, layout.caret);
  }

  private drawCompiledTextGeometry(
    layer: TextLayer,
    camera: Camera2D,
    geometry: CompiledTextGeometry,
    filters: EffectiveLayerFilters
  ) {
    if (geometry.indices.length === 0) {
      return true;
    }

    if (!isFiniteFloatArray(geometry.vertices) || !isFiniteFloatArray(geometry.texCoords)) {
      return false;
    }

    if (geometry.indices instanceof Uint32Array && !this.supportsUint32Indices) {
      return false;
    }

    const normalizedVertices = new Float32Array(geometry.vertices.length);

    for (let index = 0; index < geometry.vertices.length; index += 2) {
      normalizedVertices[index] = geometry.vertices[index] / layer.width;
      normalizedVertices[index + 1] = geometry.vertices[index + 1] / layer.height;
    }

    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.solidColorShaderProgram.setFilters(filters.filters);
    this.solidColorShaderProgram.setAdjustmentFilters(filters.adjustments);
    this.solidColorShaderProgram.setModel(this.getLayerModelMatrix(layer));
    this.bindMask(layer, this.solidColorShaderProgram);
    this.solidColorShaderProgram.setColor(this.getRenderColor(layer.color, layer.opacity));

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textGeometryPositionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, normalizedVertices, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(this.solidColorShaderProgram.positionAttributeLocation);
    this.gl.vertexAttribPointer(
      this.solidColorShaderProgram.positionAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textGeometryTexCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, geometry.texCoords, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(this.solidColorShaderProgram.texCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      this.solidColorShaderProgram.texCoordAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.textGeometryIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, geometry.indices, this.gl.DYNAMIC_DRAW);
    this.gl.drawElements(
      this.gl.TRIANGLES,
      geometry.indices.length,
      geometry.indices instanceof Uint32Array ? this.gl.UNSIGNED_INT : this.gl.UNSIGNED_SHORT,
      0
    );

    return true;
  }

  private drawTextSelection(
    layer: TextLayer,
    characterBoxes: TextCharacterBox[],
    textEdit: NonNullable<RenderOptions["textEdit"]>
  ) {
    if (textEdit.selectionStart === null || textEdit.selectionStart === undefined) {
      return;
    }

    if (textEdit.selectionEnd === null || textEdit.selectionEnd === undefined) {
      return;
    }

    const start = Math.min(textEdit.selectionStart, textEdit.selectionEnd);
    const end = Math.max(textEdit.selectionStart, textEdit.selectionEnd);

    if (start === end) {
      return;
    }

    this.solidColorShaderProgram.setMaskEnabled(false);
    this.solidColorShaderProgram.setFilters(defaultLayerFilters);
    this.solidColorShaderProgram.setAdjustmentFilters([]);
    this.solidColorShaderProgram.setColor([0.25, 0.56, 1, 0.35]);

    for (const box of characterBoxes) {
      if (box.index >= start && box.index < end) {
        this.drawLayerLocalRectangle(layer, box);
      }
    }
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
    const clippedLeft = Math.max(0, rectangle.x);
    const clippedBottom = Math.max(0, rectangle.y);
    const clippedRight = Math.min(layer.width, rectangle.x + rectangle.width);
    const clippedTop = Math.min(layer.height, rectangle.y + rectangle.height);

    if (clippedRight <= clippedLeft || clippedTop <= clippedBottom) {
      return;
    }

    const x0 = clippedLeft / layer.width;
    const y0 = clippedBottom / layer.height;
    const x1 = clippedRight / layer.width;
    const y1 = clippedTop / layer.height;
    const vertices = new Float32Array([x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1]);
    const texCoordFrame = maskFrame ?? {
      x: 0,
      y: 0,
      width: layer.width,
      height: layer.height
    };
    const u0 = (clippedLeft - texCoordFrame.x) / texCoordFrame.width;
    const v0 = (clippedBottom - texCoordFrame.y) / texCoordFrame.height;
    const u1 = (clippedRight - texCoordFrame.x) / texCoordFrame.width;
    const v1 = (clippedTop - texCoordFrame.y) / texCoordFrame.height;
    const texCoords = new Float32Array([u0, v0, u1, v0, u0, v1, u0, v1, u1, v0, u1, v1]);

    this.solidColorShaderProgram.setModel(this.getLayerModelMatrix(layer));

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.localRectanglePositionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(this.solidColorShaderProgram.positionAttributeLocation);
    this.gl.vertexAttribPointer(
      this.solidColorShaderProgram.positionAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.localRectangleTexCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(this.solidColorShaderProgram.texCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      this.solidColorShaderProgram.texCoordAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private drawLayerLocalPolygon(layer: Layer, points: Array<{ x: number; y: number }>) {
    const flatPoints = points.flatMap((point) => [point.x, point.y]);
    const indices = earcut(flatPoints, undefined, 2);

    this.drawLayerLocalTriangles(
      layer,
      indices.map((index) => points[index])
    );
  }

  private drawLayerLocalLine(
    layer: Layer,
    start: { x: number; y: number },
    end: { x: number; y: number },
    width: number
  ) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length <= 1e-6) {
      return;
    }

    const normalX = (-dy / length) * (width / 2);
    const normalY = (dx / length) * (width / 2);
    const a = { x: start.x + normalX, y: start.y + normalY };
    const b = { x: end.x + normalX, y: end.y + normalY };
    const c = { x: end.x - normalX, y: end.y - normalY };
    const d = { x: start.x - normalX, y: start.y - normalY };

    this.drawLayerLocalTriangles(layer, [a, b, d, d, b, c]);
  }


  private drawLayerLocalCircle(layer: Layer, center: { x: number; y: number }, radius: number) {
    const points: Array<{ x: number; y: number }> = [];
    const segments = 18;

    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;

      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      });
    }

    this.drawLayerLocalPolygon(layer, points);
  }

  private drawLayerLocalTriangles(layer: Layer, points: Array<{ x: number; y: number }>) {
    if (points.length === 0) {
      return;
    }

    const vertices = new Float32Array(points.length * 2);
    const texCoords = new Float32Array(points.length * 2);

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const vertexIndex = index * 2;

      vertices[vertexIndex] = point.x / layer.width;
      vertices[vertexIndex + 1] = point.y / layer.height;
      texCoords[vertexIndex] = point.x / layer.width;
      texCoords[vertexIndex + 1] = point.y / layer.height;
    }

    this.solidColorShaderProgram.setModel(this.getLayerModelMatrix(layer));

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.localRectanglePositionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(this.solidColorShaderProgram.positionAttributeLocation);
    this.gl.vertexAttribPointer(
      this.solidColorShaderProgram.positionAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.localRectangleTexCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(this.solidColorShaderProgram.texCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      this.solidColorShaderProgram.texCoordAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.drawArrays(this.gl.TRIANGLES, 0, points.length);
  }

  private drawLayerLocalVertexData(
    layer: Layer,
    vertices: Float32Array,
    texCoords: Float32Array
  ) {
    if (vertices.length === 0) {
      return;
    }

    this.solidColorShaderProgram.setModel(this.getLayerModelMatrix(layer));

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.localRectanglePositionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(this.solidColorShaderProgram.positionAttributeLocation);
    this.gl.vertexAttribPointer(
      this.solidColorShaderProgram.positionAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.localRectangleTexCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(this.solidColorShaderProgram.texCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      this.solidColorShaderProgram.texCoordAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.drawArrays(this.gl.TRIANGLES, 0, vertices.length / 2);
  }

  private drawBrushLayerLocalVertexData(
    layer: Layer,
    vertices: Float32Array,
    texCoords: Float32Array
  ) {
    if (vertices.length === 0) {
      return;
    }

    this.brushShaderProgram.setModel(this.getLayerModelMatrix(layer));

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.localRectanglePositionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(this.brushShaderProgram.positionAttributeLocation);
    this.gl.vertexAttribPointer(
      this.brushShaderProgram.positionAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.localRectangleTexCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(this.brushShaderProgram.texCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      this.brushShaderProgram.texCoordAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.drawArrays(this.gl.TRIANGLES, 0, vertices.length / 2);
  }

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

function isFiniteFloatArray(values: Float32Array) {
  for (const value of values) {
    if (!Number.isFinite(value)) {
      return false;
    }
  }

  return true;
}

function getEffectiveLayerFilters(layers: Layer[]) {
  const effectiveFilters = new Map<Layer, EffectiveLayerFilters>();
  let adjustmentFiltersAbove: LayerFilterAdjustment[] = [];

  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];

    if (layer instanceof AdjustmentLayer) {
      if (layer.visible && layer.opacity > 0) {
        adjustmentFiltersAbove = [
          {
            bounds: getLayerWorldBounds(layer),
            filters: scaleLayerFilters(layer.filters, layer.opacity),
            inverseMatrix: getLayerInverseMatrix(layer),
            size: [1, 1]
          },
          ...adjustmentFiltersAbove
        ];
      }

      effectiveFilters.set(layer, {
        adjustments: [],
        filters: defaultLayerFilters
      });
      continue;
    }

    effectiveFilters.set(layer, {
      adjustments: adjustmentFiltersAbove,
      filters: layer.filters
    });
  }

  return layers.map(
    (layer): EffectiveLayerFilters =>
      effectiveFilters.get(layer) ?? {
        adjustments: [],
        filters: layer.filters
      }
  );
}

function combineLayerFilters(base: LayerFilterSettings, overlay: LayerFilterSettings) {
  return {
    brightness: clampFilter(base.brightness + overlay.brightness, -1, 1),
    blur: clampFilter(base.blur + overlay.blur, 0, 64),
    contrast: clampFilter(base.contrast + overlay.contrast, -1, 1),
    dropShadowBlur: clampFilter(base.dropShadowBlur + overlay.dropShadowBlur, 0, 80),
    dropShadowOffsetX: clampFilter(
      base.dropShadowOffsetX + overlay.dropShadowOffsetX - defaultLayerFilters.dropShadowOffsetX,
      -240,
      240
    ),
    dropShadowOffsetY: clampFilter(
      base.dropShadowOffsetY + overlay.dropShadowOffsetY - defaultLayerFilters.dropShadowOffsetY,
      -240,
      240
    ),
    dropShadowOpacity: combineAmountFilter(base.dropShadowOpacity, overlay.dropShadowOpacity),
    grayscale: combineAmountFilter(base.grayscale, overlay.grayscale),
    hue: clampFilter(base.hue + overlay.hue, -180, 180),
    invert: combineAmountFilter(base.invert, overlay.invert),
    saturation: clampFilter(base.saturation + overlay.saturation, -1, 1),
    sepia: combineAmountFilter(base.sepia, overlay.sepia),
    shadow: clampFilter(base.shadow + overlay.shadow, -1, 1)
  };
}

function scaleLayerFilters(filters: LayerFilterSettings, amount: number) {
  return {
    brightness: filters.brightness * amount,
    blur: filters.blur * amount,
    contrast: filters.contrast * amount,
    dropShadowBlur: filters.dropShadowBlur * amount,
    dropShadowOffsetX:
      defaultLayerFilters.dropShadowOffsetX +
      (filters.dropShadowOffsetX - defaultLayerFilters.dropShadowOffsetX) * amount,
    dropShadowOffsetY:
      defaultLayerFilters.dropShadowOffsetY +
      (filters.dropShadowOffsetY - defaultLayerFilters.dropShadowOffsetY) * amount,
    dropShadowOpacity: filters.dropShadowOpacity * amount,
    grayscale: filters.grayscale * amount,
    hue: filters.hue * amount,
    invert: filters.invert * amount,
    saturation: filters.saturation * amount,
    sepia: filters.sepia * amount,
    shadow: filters.shadow * amount
  };
}

function combineAmountFilter(base: number, overlay: number) {
  return clampFilter(1 - (1 - base) * (1 - overlay), 0, 1);
}

function clampFilter(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hasAdjustmentBlur(layers: Layer[]) {
  return layers.some(
    (layer) =>
      layer instanceof AdjustmentLayer &&
      layer.visible &&
      layer.opacity > 0 &&
      layer.filters.blur * layer.opacity > 0.5
  );
}

function getTopmostAdjustmentBlurIndex(layers: Layer[]) {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];

    if (
      layer instanceof AdjustmentLayer &&
      layer.visible &&
      layer.opacity > 0 &&
      layer.filters.blur * layer.opacity > 0.5
    ) {
      return index;
    }
  }

  return layers.length - 1;
}

function getAdjustmentLayerBlurRegion(
  layer: AdjustmentLayer,
  camera: Camera2D,
  cssWidth: number,
  cssHeight: number,
  textureWidth: number
): BlurRegion | null {
  const pixelScale = textureWidth / Math.max(1, cssWidth);
  const radius = layer.filters.blur * layer.opacity * pixelScale;

  if (radius <= 0.5) {
    return null;
  }

  return {
    bounds: worldBoundsToTextureBounds(getLayerWorldBounds(layer), camera, cssWidth, cssHeight),
    inverseMatrix: getLayerInverseMatrix(layer),
    radius: Math.min(radius, textureWidth * 0.12),
    size: [1, 1]
  };
}

function toClipOnlyBlurRegions(regions: BlurRegion[]): BlurRegion[] {
  return regions.map((region) => ({
    ...region,
    radius: 0
  }));
}

function getAdjustmentBlurRegions(
  layers: Layer[],
  camera: Camera2D,
  cssWidth: number,
  cssHeight: number,
  textureWidth: number,
  textureHeight: number
): BlurRegion[] {
  const pixelScale = textureWidth / Math.max(1, cssWidth);
  const regions: BlurRegion[] = [];

  for (const layer of layers) {
    if (!(layer instanceof AdjustmentLayer) || !layer.visible || layer.opacity <= 0) {
      continue;
    }

    const radius = layer.filters.blur * layer.opacity * pixelScale;

    if (radius <= 0.5) {
      continue;
    }

    regions.push({
      bounds: worldBoundsToTextureBounds(getLayerWorldBounds(layer), camera, cssWidth, cssHeight),
      inverseMatrix: getLayerInverseMatrix(layer),
      radius: Math.min(radius, Math.max(textureWidth, textureHeight) * 0.08),
      size: [1, 1]
    });

    if (regions.length >= 4) {
      break;
    }
  }

  return regions;
}

function worldBoundsToTextureBounds(
  bounds: [number, number, number, number],
  camera: Camera2D,
  cssWidth: number,
  cssHeight: number
): [number, number, number, number] {
  const [x, y, width, height] = bounds;
  const screenCorners = [
    camera.worldToScreen(x, y),
    camera.worldToScreen(x + width, y),
    camera.worldToScreen(x + width, y + height),
    camera.worldToScreen(x, y + height)
  ];
  const minScreenX = Math.min(...screenCorners.map((corner) => corner.x));
  const maxScreenX = Math.max(...screenCorners.map((corner) => corner.x));
  const minScreenY = Math.min(...screenCorners.map((corner) => corner.y));
  const maxScreenY = Math.max(...screenCorners.map((corner) => corner.y));
  const left = clampFilter(minScreenX / Math.max(1, cssWidth), 0, 1);
  const right = clampFilter(maxScreenX / Math.max(1, cssWidth), 0, 1);
  const bottom = clampFilter(1 - maxScreenY / Math.max(1, cssHeight), 0, 1);
  const top = clampFilter(1 - minScreenY / Math.max(1, cssHeight), 0, 1);

  return [left, bottom, Math.max(0, right - left), Math.max(0, top - bottom)];
}

function getLayerWorldBounds(layer: Layer): [number, number, number, number] {
  const corners = getLayerCorners(layer);
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

function getLayerInverseMatrix(
  layer: Layer
): [number, number, number, number, number, number, number, number, number] {
  const inverseMatrix = invert3x3(getModelMatrix(layer));
  const matrix = inverseMatrix ?? new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  return [
    matrix[0],
    matrix[1],
    matrix[2],
    matrix[3],
    matrix[4],
    matrix[5],
    matrix[6],
    matrix[7],
    matrix[8]
  ];
}

function getDropShadowPasses(filters: LayerFilterSettings) {
  const blur = filters.dropShadowBlur;

  if (blur <= 0.5) {
    return [{ opacity: 1, x: 0, y: 0 }];
  }

  const spread = blur * 0.35;
  const diagonalSpread = spread * 0.7071;

  return [
    { opacity: 0.2, x: 0, y: 0 },
    { opacity: 0.1, x: spread, y: 0 },
    { opacity: 0.1, x: -spread, y: 0 },
    { opacity: 0.1, x: 0, y: spread },
    { opacity: 0.1, x: 0, y: -spread },
    { opacity: 0.1, x: diagonalSpread, y: diagonalSpread },
    { opacity: 0.1, x: -diagonalSpread, y: diagonalSpread },
    { opacity: 0.1, x: diagonalSpread, y: -diagonalSpread },
    { opacity: 0.1, x: -diagonalSpread, y: -diagonalSpread }
  ];
}

function getPolygonShapePoints(layer: ShapeLayer) {
  const width = layer.width;
  const height = layer.height;

  if (layer.shape === "triangle") {
    return [
      { x: width / 2, y: height },
      { x: width, y: 0 },
      { x: 0, y: 0 }
    ];
  }

  if (layer.shape === "diamond") {
    return [
      { x: width / 2, y: height },
      { x: width, y: height / 2 },
      { x: width / 2, y: 0 },
      { x: 0, y: height / 2 }
    ];
  }

  if (layer.shape === "arrow") {
    return [
      { x: 0, y: height * 0.25 },
      { x: width * 0.62, y: height * 0.25 },
      { x: width * 0.62, y: 0 },
      { x: width, y: height * 0.5 },
      { x: width * 0.62, y: height },
      { x: width * 0.62, y: height * 0.75 },
      { x: 0, y: height * 0.75 }
    ];
  }

  return [];
}

function getLayerSelectionClip(layer: StrokeLayer, clip: StrokeSelectionClip | null) {
  if (!clip) {
    return null;
  }

  if (clip.coordinateSpace === "layer") {
    return clip;
  }

  const inverseModel = invert3x3(getModelMatrix(layer));

  if (!inverseModel) {
    return null;
  }

  const bounds = clip.bounds;
  const corners = [
    transformPoint3x3(inverseModel, bounds.x, bounds.y),
    transformPoint3x3(inverseModel, bounds.x + bounds.width, bounds.y),
    transformPoint3x3(inverseModel, bounds.x + bounds.width, bounds.y + bounds.height),
    transformPoint3x3(inverseModel, bounds.x, bounds.y + bounds.height)
  ];
  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const maxY = Math.max(...corners.map((corner) => corner.y));

  return {
    bounds: {
      height: maxY - minY,
      width: maxX - minX,
      x: minX,
      y: minY
    },
    inverted: clip.inverted,
    shape: clip.shape
  };
}

function buildStrokePathGeometry(layer: StrokeLayer, path: StrokePath): CachedStrokePathGeometry {
  const width = getRenderedStrokeWidth(path.strokeStyle, path.strokeWidth);
  const points = simplifyStrokePoints(path.points, Math.max(0.75, width * 0.08));

  const meshVertices =
    points.length === 1
      ? getSinglePointStrokeGeometry(path.strokeStyle, points[0], width / 2)
      : [
          ...getPolylineStrokeGeometry(points, width),
          ...getStrokeCaps(path.strokeStyle, points, width / 2, width)
        ];

  const vertices = new Float32Array(meshVertices.length * 2);
  const texCoords = new Float32Array(meshVertices.length * 2);

  for (let index = 0; index < meshVertices.length; index += 1) {
    const point = meshVertices[index];
    const vertexIndex = index * 2;

    vertices[vertexIndex] = point.x / Math.max(1e-6, layer.width);
    vertices[vertexIndex + 1] = point.y / Math.max(1e-6, layer.height);

    texCoords[vertexIndex] = point.u;
    texCoords[vertexIndex + 1] = point.v;
  }

  return {
    brushSize: path.strokeWidth,
    brushStyle: getBrushStyleUniform(path.strokeStyle),
    color: getRenderedStrokeColor(path.strokeStyle, path.color),
    selectionClip: path.selectionClip ?? null,
    texCoords,
    vertices
  };
}

function getBrushStyleUniform(style: StrokeStyle) {
  if (style === "pencil") {
    return 1;
  }

  if (style === "brush") {
    return 2;
  }

  if (style === "marker") {
    return 3;
  }

  if (style === "highlighter") {
    return 4;
  }

  return 0;
}

function simplifyStrokePoints(points: Array<{ x: number; y: number }>, minDistance: number) {
  if (points.length <= 2) {
    return points;
  }

  const simplified = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const point = points[index];

    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= minDistance) {
      simplified.push(point);
    }
  }

  simplified.push(points[points.length - 1]);

  return simplified;
}

function getRenderedStrokeWidth(style: StrokeStyle, width: number) {
  if (style === "pencil") {
    return width * 0.62;
  }

  if (style === "marker") {
    return width * 0.9;
  }

  if (style === "highlighter") {
    return width * 1.1;
  }

  if (style === "brush") {
    return width * 1.05;
  }

  return width;
}

function getRenderedStrokeColor(
  style: StrokeStyle,
  color: [number, number, number, number]
): [number, number, number, number] {
  if (style === "pencil") {
    return [color[0], color[1], color[2], color[3] * 0.88];
  }

  if (style === "highlighter") {
    return [color[0], color[1], color[2], color[3] * 0.52];
  }

  if (style === "marker") {
    return [color[0], color[1], color[2], color[3] * 0.94];
  }

  return color;
}

function getPolylineStrokeGeometry(points: Array<{ x: number; y: number }>, width: number) {
  if (points.length < 2) {
    return [];
  }

  const halfWidth = width / 2;
  const widthScale = Math.max(width, 1e-6);
  const segmentNormals: Array<{ x: number; y: number }> = [];
  const distances = getPathLengths(points);

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    segmentNormals.push(
      length <= 1e-6
        ? { x: 0, y: 1 }
        : {
            x: -dy / length,
            y: dx / length
          }
    );
  }

  const left: StrokeMeshVertex[] = [];
  const right: StrokeMeshVertex[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const previousNormal = segmentNormals[Math.max(0, index - 1)];
    const nextNormal = segmentNormals[Math.min(segmentNormals.length - 1, index)];
    const normal =
      index === 0
        ? nextNormal
        : index === points.length - 1
          ? previousNormal
          : getJoinNormal(previousNormal, nextNormal);

    const miterScale =
      index === 0 || index === points.length - 1
        ? 1
        : Math.min(1.8, Math.max(1, 1 / Math.max(0.45, Math.abs(dot(normal, nextNormal)))));

    const point = points[index];
    const u = distances[index] / widthScale;
    const offsetX = normal.x * halfWidth * miterScale;
    const offsetY = normal.y * halfWidth * miterScale;

    left.push({
      x: point.x + offsetX,
      y: point.y + offsetY,
      u,
      v: 0
    });

    right.push({
      x: point.x - offsetX,
      y: point.y - offsetY,
      u,
      v: 1
    });
  }

  const triangles: StrokeMeshVertex[] = [];

  for (let index = 1; index < points.length; index += 1) {
    triangles.push(left[index - 1], left[index], right[index - 1]);
    triangles.push(right[index - 1], left[index], right[index]);
  }

  return triangles;
}


function getSinglePointStrokeGeometry(
  style: StrokeStyle,
  center: { x: number; y: number },
  radius: number
) {
  const width = radius * 2;
  const halfSegment = Math.max(0.01, radius * 0.35);

  const pseudoPoints = [
    { x: center.x - halfSegment, y: center.y },
    { x: center.x + halfSegment, y: center.y }
  ];

  if (style === "marker" || style === "highlighter") {
    return getPolylineStrokeGeometry(pseudoPoints, width);
  }

  return [
    ...getPolylineStrokeGeometry(pseudoPoints, width),
    ...getStrokeCaps(style, pseudoPoints, radius, width)
  ];
}

function getStrokeCaps(
  style: StrokeStyle,
  points: Array<{ x: number; y: number }>,
  radius: number,
  strokeWidth = radius * 2
) {
  if (style === "marker" || style === "highlighter") {
    return [];
  }

  const start = points[0];
  const next = points[1];
  const end = points[points.length - 1];
  const previous = points[points.length - 2];
  const totalLength = getPathLength(points);
  const endU = totalLength / Math.max(strokeWidth, 1e-6);

  if (style === "pencil" || style === "brush") {
    return [
      ...getLocalTaperCap(start, next, radius, 0, strokeWidth),
      ...getLocalTaperCap(end, previous, radius, endU, strokeWidth)
    ];
  }

  return [
    ...getLocalRoundCap(start, next, radius, 0, strokeWidth),
    ...getLocalRoundCap(end, previous, radius, endU, strokeWidth)
  ];
}


function getLocalRoundCap(
  center: { x: number; y: number },
  neighbor: { x: number; y: number },
  radius: number,
  centerU: number,
  strokeWidth: number
) {
  const dx = center.x - neighbor.x;
  const dy = center.y - neighbor.y;
  const length = Math.hypot(dx, dy);

  if (length <= 1e-6) {
    return [];
  }

  const outwardDirection = { x: dx / length, y: dy / length };

  return getLocalSemicirclePoints(center, outwardDirection, radius, centerU, strokeWidth);
}

function getLocalTaperCap(
  center: { x: number; y: number },
  neighbor: { x: number; y: number },
  radius: number,
  centerU: number,
  strokeWidth: number
) {
  const dx = center.x - neighbor.x;
  const dy = center.y - neighbor.y;
  const length = Math.hypot(dx, dy);

  if (length <= 1e-6) {
    return [];
  }

  const tangent = { x: dx / length, y: dy / length };
  const normal = { x: -tangent.y, y: tangent.x };
  const tipDistance = radius * 0.75;

  const left = {
    x: center.x + normal.x * radius,
    y: center.y + normal.y * radius
  };

  const right = {
    x: center.x - normal.x * radius,
    y: center.y - normal.y * radius
  };

  const tip = {
    x: center.x + tangent.x * tipDistance,
    y: center.y + tangent.y * tipDistance
  };

  return [
    mapStrokeCapVertex(center, center, tangent, normal, centerU, strokeWidth),
    mapStrokeCapVertex(left, center, tangent, normal, centerU, strokeWidth),
    mapStrokeCapVertex(tip, center, tangent, normal, centerU, strokeWidth),

    mapStrokeCapVertex(center, center, tangent, normal, centerU, strokeWidth),
    mapStrokeCapVertex(tip, center, tangent, normal, centerU, strokeWidth),
    mapStrokeCapVertex(right, center, tangent, normal, centerU, strokeWidth)
  ];
}

function getLocalSemicirclePoints(
  center: { x: number; y: number },
  outwardDirection: { x: number; y: number },
  radius: number,
  centerU: number,
  strokeWidth: number
) {
  const points: StrokeMeshVertex[] = [];
  const segments = 10;
  const tangent = outwardDirection;
  const normal = { x: -tangent.y, y: tangent.x };
  const angle = Math.atan2(outwardDirection.y, outwardDirection.x);
  const startAngle = angle - Math.PI / 2;

  for (let index = 0; index < segments; index += 1) {
    const a0 = startAngle + (index / segments) * Math.PI;
    const a1 = startAngle + ((index + 1) / segments) * Math.PI;

    const p0 = {
      x: center.x + Math.cos(a0) * radius,
      y: center.y + Math.sin(a0) * radius
    };

    const p1 = {
      x: center.x + Math.cos(a1) * radius,
      y: center.y + Math.sin(a1) * radius
    };

    points.push(
      mapStrokeCapVertex(center, center, tangent, normal, centerU, strokeWidth),
      mapStrokeCapVertex(p0, center, tangent, normal, centerU, strokeWidth),
      mapStrokeCapVertex(p1, center, tangent, normal, centerU, strokeWidth)
    );
  }

  return points;
}

function getJoinNormal(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = a.x + b.x;
  const y = a.y + b.y;
  const length = Math.hypot(x, y);

  if (length <= 1e-6) {
    return b;
  }

  return {
    x: x / length,
    y: y / length
  };
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x * b.x + a.y * b.y;
}

function getPathLengths(points: Array<{ x: number; y: number }>) {
  const distances = [0];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    distances.push(distances[index - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
  }

  return distances;
}

function getPathLength(points: Array<{ x: number; y: number }>) {
  const distances = getPathLengths(points);
  return distances[distances.length - 1] ?? 0;
}

function mapStrokeCapVertex(
  point: { x: number; y: number },
  center: { x: number; y: number },
  tangent: { x: number; y: number },
  normal: { x: number; y: number },
  centerU: number,
  strokeWidth: number
): StrokeMeshVertex {
  const offsetX = point.x - center.x;
  const offsetY = point.y - center.y;
  const alongOffset = offsetX * tangent.x + offsetY * tangent.y;
  const acrossOffset = offsetX * normal.x + offsetY * normal.y;
  const widthScale = Math.max(strokeWidth, 1e-6);

  return {
    x: point.x,
    y: point.y,
    u: centerU + alongOffset / widthScale,
    v: Math.max(0, Math.min(1, 0.5 + acrossOffset / widthScale))
  };
}