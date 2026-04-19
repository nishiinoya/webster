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
import { Layer } from "../layers/Layer";
import { ShapeLayer } from "../layers/ShapeLayer";
import { StrokeLayer } from "../layers/StrokeLayer";
import type { StrokePath, StrokeStyle } from "../layers/StrokeLayer";
import { TextLayer } from "../layers/TextLayer";
import { CheckerboardShaderProgram } from "./shaders/CheckerboardShaderProgram";
import { BrushShaderProgram } from "./shaders/BrushShaderProgram";
import { loadShaderSource } from "./shaders/loadShaderSource";
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
  texturedFragment: string;
  texturedVertex: string;
};

export type RenderOptions = {
  documentBackground: "checkerboard" | "transparent" | "white";
  showSelectionOverlay: boolean;
  showSelectionOutline: boolean;
  textEdit?: {
    caretIndex: number;
    layerId: string;
    selectionEnd?: number | null;
    selectionStart?: number | null;
  } | null;
};

type CachedStrokePathGeometry = {
  brushSize: number;
  brushStyle: number;
  color: [number, number, number, number];
  texCoords: Float32Array;
  vertices: Float32Array;
};

type StrokeGeometryCacheEntry = {
  paths: CachedStrokePathGeometry[];
  revision: number;
};

export const editorRenderOptions: RenderOptions = {
  documentBackground: "checkerboard",
  showSelectionOverlay: true,
  showSelectionOutline: true,
  textEdit: null
};

export const imageExportRenderOptions: RenderOptions = {
  documentBackground: "transparent",
  showSelectionOverlay: false,
  showSelectionOutline: false,
  textEdit: null
};

export class Renderer {
  private readonly gl: WebGLRenderingContext;
  private readonly solidColorShaderProgram: SolidColorShaderProgram;
  private readonly brushShaderProgram: BrushShaderProgram;
  private readonly checkerboardShaderProgram: CheckerboardShaderProgram;
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
    this.clear(options);

    this.drawDocumentBackground(scene, camera, options);

    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);

    for (const layer of scene.layers) {
      if (!layer.visible || layer.opacity <= 0) {
        continue;
      }

      if (layer instanceof ShapeLayer) {
        this.drawShapeLayer(layer, camera);
      }

      if (layer instanceof StrokeLayer) {
        this.drawStrokeLayer(layer, camera);
      }

      if (layer instanceof ImageLayer) {
        this.texturedShaderProgram.use();
        this.texturedShaderProgram.setProjection(camera.projectionMatrix);
        this.texturedShaderProgram.setModel(getModelMatrix(layer));
        this.texturedShaderProgram.setTextureUnit(0);
        this.texturedShaderProgram.setMaskTextureUnit(1);
        this.texturedShaderProgram.setOpacity(layer.opacity);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureManager.getTexture(layer));
        this.bindMask(layer, this.texturedShaderProgram);
        this.quad.drawTextured(this.texturedShaderProgram);
        this.solidColorShaderProgram.use();
        this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
      }

      if (layer instanceof TextLayer) {
        this.drawTextLayer(layer, camera, options.textEdit);
      }
    }

    const selectedLayer = scene.selectedLayerId ? scene.getLayer(scene.selectedLayerId) : null;

    if (options.showSelectionOutline && selectedLayer?.visible && selectedLayer.opacity > 0) {
      this.drawSelectionOutline(selectedLayer, camera);
    }

    const selection = scene.selection.visibleSelection;

    if (options.showSelectionOverlay && selection) {
      this.selectionOverlayRenderer.render(selection, camera, scene.document);
    }
  }

  dispose() {
    this.quad.dispose();
    this.textureManager.dispose();
    this.texturedShaderProgram.dispose();
    this.checkerboardShaderProgram.dispose();
    this.brushShaderProgram.dispose();
    this.solidColorShaderProgram.dispose();
    this.ellipseMesh.dispose();
    this.gl.deleteBuffer(this.localRectanglePositionBuffer);
    this.gl.deleteBuffer(this.localRectangleTexCoordBuffer);
    this.gl.deleteBuffer(this.textGeometryPositionBuffer);
    this.gl.deleteBuffer(this.textGeometryTexCoordBuffer);
    this.gl.deleteBuffer(this.textGeometryIndexBuffer);
  }

  private clear(options: RenderOptions) {
    if (options.documentBackground === "transparent") {
      this.gl.clearColor(0, 0, 0, 0);
    } else {
      this.gl.clearColor(0.07, 0.08, 0.09, 1);
    }

    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  private drawDocumentBackground(scene: Scene, camera: Camera2D, options: RenderOptions) {
    if (options.documentBackground === "transparent") {
      return;
    }

    if (options.documentBackground === "white") {
      this.solidColorShaderProgram.use();
      this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
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

  private drawShapeLayer(layer: ShapeLayer, camera: Camera2D) {
    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);

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

  private drawStrokeLayer(layer: StrokeLayer, camera: Camera2D) {
    if (layer.paths.length === 0) {
      return;
    }

    const cachedGeometry = this.getStrokeGeometry(layer);

    this.brushShaderProgram.use();
    this.brushShaderProgram.setProjection(camera.projectionMatrix);
    this.bindMask(layer, this.brushShaderProgram);

    for (const path of cachedGeometry.paths) {
      this.brushShaderProgram.setColor([
        path.color[0],
        path.color[1],
        path.color[2],
        path.color[3] * layer.opacity
      ]);
      this.brushShaderProgram.setBrushStyle(path.brushStyle);
      this.brushShaderProgram.setBrushSize(path.brushSize);
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
      this.solidColorShaderProgram.setColor([
        layer.fillColor[0],
        layer.fillColor[1],
        layer.fillColor[2],
        layer.fillColor[3] * layer.opacity
      ]);
      this.bindMask(layer, this.solidColorShaderProgram);
      this.drawLayerLocalPolygon(layer, points);
    }

    if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
      return;
    }

    this.solidColorShaderProgram.setColor([
      layer.strokeColor[0],
      layer.strokeColor[1],
      layer.strokeColor[2],
      layer.strokeColor[3] * layer.opacity
    ]);
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
      this.solidColorShaderProgram.setColor([
        layer.fillColor[0],
        layer.fillColor[1],
        layer.fillColor[2],
        layer.fillColor[3] * layer.opacity
      ]);
      this.solidColorShaderProgram.setModel(getModelMatrix(layer));
      this.bindMask(layer, this.solidColorShaderProgram);
      this.quad.drawTextured(this.solidColorShaderProgram);
    }

      if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
        return;
      }

      this.solidColorShaderProgram.setColor([
        layer.strokeColor[0],
        layer.strokeColor[1],
        layer.strokeColor[2],
        layer.strokeColor[3] * layer.opacity
      ]);
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

    this.solidColorShaderProgram.setColor([
      layer.strokeColor[0],
      layer.strokeColor[1],
      layer.strokeColor[2],
      layer.strokeColor[3] * layer.opacity
    ]);
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
      this.solidColorShaderProgram.setColor([
        layer.fillColor[0],
        layer.fillColor[1],
        layer.fillColor[2],
        layer.fillColor[3] * layer.opacity
      ]);
      this.solidColorShaderProgram.setModel(getModelMatrix(layer));
      this.bindMask(layer, this.solidColorShaderProgram);
      this.ellipseMesh.drawFill(this.solidColorShaderProgram);
    }

    if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
      return;
    }

    this.solidColorShaderProgram.setColor([
      layer.strokeColor[0],
      layer.strokeColor[1],
      layer.strokeColor[2],
      layer.strokeColor[3] * layer.opacity
    ]);
    this.solidColorShaderProgram.setModel(getModelMatrix(layer));
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
    textEdit: RenderOptions["textEdit"]
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

      const didDrawCompiledText = this.drawCompiledTextGeometry(layer, camera, geometry);

      if (didDrawCompiledText && textEdit?.layerId === layer.id) {
        this.solidColorShaderProgram.setMaskEnabled(false);
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
      this.drawTextSelection(layer, layout.characterBoxes, textEdit);
    }

    this.solidColorShaderProgram.use();
    this.solidColorShaderProgram.setProjection(camera.projectionMatrix);
    this.bindMask(layer, this.solidColorShaderProgram);
    this.solidColorShaderProgram.setColor([
      layer.color[0],
      layer.color[1],
      layer.color[2],
      layer.color[3] * layer.opacity
    ]);

    for (const glyph of layout.glyphs) {
      this.drawLayerLocalRectangle(layer, glyph, layout.maskFrame);
    }

    if (textEdit?.layerId !== layer.id) {
      this.solidColorShaderProgram.setMaskEnabled(false);
      return;
    }

    this.solidColorShaderProgram.setMaskEnabled(false);
    this.solidColorShaderProgram.setColor([0.39, 0.86, 0.75, 1]);
    this.drawLayerLocalRectangle(layer, layout.caret);
  }

  private drawCompiledTextGeometry(
    layer: TextLayer,
    camera: Camera2D,
    geometry: CompiledTextGeometry
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
    this.solidColorShaderProgram.setModel(getModelMatrix(layer));
    this.bindMask(layer, this.solidColorShaderProgram);
    this.solidColorShaderProgram.setColor([
      layer.color[0],
      layer.color[1],
      layer.color[2],
      layer.color[3] * layer.opacity
    ]);

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

    this.solidColorShaderProgram.setModel(getModelMatrix(layer));

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

    this.solidColorShaderProgram.setModel(getModelMatrix(layer));

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

    this.solidColorShaderProgram.setModel(getModelMatrix(layer));

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

    this.brushShaderProgram.setModel(getModelMatrix(layer));

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

function buildStrokePathGeometry(layer: StrokeLayer, path: StrokePath): CachedStrokePathGeometry {
  const width = getRenderedStrokeWidth(path.strokeStyle, path.strokeWidth);
  const points = simplifyStrokePoints(path.points, Math.max(0.75, width * 0.08));
  const triangles =
    points.length === 1
      ? getSinglePointStrokeGeometry(path.strokeStyle, points[0], width / 2)
      : [
          ...getPolylineTriangles(points, width),
          ...getStrokeCaps(path.strokeStyle, points, width / 2)
        ];
  const vertices = new Float32Array(triangles.length * 2);
  const texCoords = new Float32Array(triangles.length * 2);

  for (let index = 0; index < triangles.length; index += 1) {
    const point = triangles[index];
    const vertexIndex = index * 2;

    vertices[vertexIndex] = point.x / Math.max(1e-6, layer.width);
    vertices[vertexIndex + 1] = point.y / Math.max(1e-6, layer.height);
    texCoords[vertexIndex] = vertices[vertexIndex];
    texCoords[vertexIndex + 1] = vertices[vertexIndex + 1];
  }

  return {
    brushSize: path.strokeWidth,
    brushStyle: getBrushStyleUniform(path.strokeStyle),
    color: getRenderedStrokeColor(path.strokeStyle, path.color),
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

function getPolylineTriangles(points: Array<{ x: number; y: number }>, width: number) {
  if (points.length < 2) {
    return [];
  }

  const halfWidth = width / 2;
  const segmentNormals: Array<{ x: number; y: number }> = [];

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

  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];

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

    left.push({
      x: point.x + normal.x * halfWidth * miterScale,
      y: point.y + normal.y * halfWidth * miterScale
    });
    right.push({
      x: point.x - normal.x * halfWidth * miterScale,
      y: point.y - normal.y * halfWidth * miterScale
    });
  }

  const triangles: Array<{ x: number; y: number }> = [];

  for (let index = 1; index < points.length; index += 1) {
    triangles.push(left[index - 1], left[index], right[index - 1]);
    triangles.push(right[index - 1], left[index], right[index]);
  }

  return triangles;
}

function getLocalCirclePoints(center: { x: number; y: number }, radius: number) {
  const points: Array<{ x: number; y: number }> = [];
  const segments = 12;

  for (let index = 0; index < segments; index += 1) {
    const startAngle = (index / segments) * Math.PI * 2;
    const endAngle = ((index + 1) / segments) * Math.PI * 2;

    points.push(
      center,
      {
        x: center.x + Math.cos(startAngle) * radius,
        y: center.y + Math.sin(startAngle) * radius
      },
      {
        x: center.x + Math.cos(endAngle) * radius,
        y: center.y + Math.sin(endAngle) * radius
      }
    );
  }

  return points;
}

function getSinglePointStrokeGeometry(
  style: StrokeStyle,
  center: { x: number; y: number },
  radius: number
) {
  if (style === "marker" || style === "highlighter") {
    return getLocalSquarePoints(center, radius);
  }

  return getLocalCirclePoints(center, radius);
}

function getStrokeCaps(style: StrokeStyle, points: Array<{ x: number; y: number }>, radius: number) {
  if (style === "marker" || style === "highlighter") {
    return [];
  }

  const start = points[0];
  const next = points[1];
  const end = points[points.length - 1];
  const previous = points[points.length - 2];

  if (style === "pencil" || style === "brush") {
    return [
      ...getLocalTaperCap(start, next, radius),
      ...getLocalTaperCap(end, previous, radius)
    ];
  }

  return [
    ...getLocalRoundCap(start, next, radius),
    ...getLocalRoundCap(end, previous, radius)
  ];
}

function getLocalSquarePoints(center: { x: number; y: number }, radius: number) {
  return [
    { x: center.x - radius, y: center.y - radius },
    { x: center.x + radius, y: center.y - radius },
    { x: center.x - radius, y: center.y + radius },
    { x: center.x - radius, y: center.y + radius },
    { x: center.x + radius, y: center.y - radius },
    { x: center.x + radius, y: center.y + radius }
  ];
}

function getLocalRoundCap(
  center: { x: number; y: number },
  neighbor: { x: number; y: number },
  radius: number
) {
  const dx = center.x - neighbor.x;
  const dy = center.y - neighbor.y;
  const length = Math.hypot(dx, dy);

  if (length <= 1e-6) {
    return getLocalCirclePoints(center, radius);
  }

  const outwardDirection = { x: dx / length, y: dy / length };

  return getLocalSemicirclePoints(center, outwardDirection, radius);
}

function getLocalTaperCap(
  center: { x: number; y: number },
  neighbor: { x: number; y: number },
  radius: number
) {
  const dx = center.x - neighbor.x;
  const dy = center.y - neighbor.y;
  const length = Math.hypot(dx, dy);

  if (length <= 1e-6) {
    return getLocalCirclePoints(center, radius);
  }

  const direction = { x: dx / length, y: dy / length };
  const normal = { x: -direction.y, y: direction.x };
  const tipDistance = radius * 0.75;

  return [
    {
      x: center.x + normal.x * radius,
      y: center.y + normal.y * radius
    },
    {
      x: center.x - normal.x * radius,
      y: center.y - normal.y * radius
    },
    {
      x: center.x + direction.x * tipDistance,
      y: center.y + direction.y * tipDistance
    }
  ];
}

function getLocalSemicirclePoints(
  center: { x: number; y: number },
  outwardDirection: { x: number; y: number },
  radius: number
) {
  const points: Array<{ x: number; y: number }> = [];
  const segments = 8;
  const angle = Math.atan2(outwardDirection.y, outwardDirection.x);
  const startAngle = angle - Math.PI / 2;

  for (let index = 0; index < segments; index += 1) {
    const a0 = startAngle + (index / segments) * Math.PI;
    const a1 = startAngle + ((index + 1) / segments) * Math.PI;

    points.push(
      center,
      {
        x: center.x + Math.cos(a0) * radius,
        y: center.y + Math.sin(a0) * radius
      },
      {
        x: center.x + Math.cos(a1) * radius,
        y: center.y + Math.sin(a1) * radius
      }
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
