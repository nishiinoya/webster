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
import { TextLayer } from "../layers/TextLayer";
import { CheckerboardShaderProgram } from "./shaders/CheckerboardShaderProgram";
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

export type RendererShaderSources = {
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
  private width = 0;
  private height = 0;
  private cssWidth = 1;
  private cssHeight = 1;

  static async create(
    canvas: HTMLCanvasElement,
    options: { alpha?: boolean; preserveDrawingBuffer?: boolean } = {}
  ) {
    const [
      checkerboardFragment,
      checkerboardVertex,
      solidFragment,
      solidVertex,
      texturedFragment,
      texturedVertex,
      fontLoader
    ] = await Promise.all([
      loadShaderSource("/glsl/checkerboard.frag.glsl"),
      loadShaderSource("/glsl/checkerboard.vert.glsl"),
      loadShaderSource("/glsl/solid.frag.glsl"),
      loadShaderSource("/glsl/solid.vert.glsl"),
      loadShaderSource("/glsl/textured.frag.glsl"),
      loadShaderSource("/glsl/textured.vert.glsl"),
      FontLoader.create()
    ]);

    return new Renderer(
      canvas,
      {
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
    options: { alpha?: boolean; preserveDrawingBuffer?: boolean } = {}
  ) {
    const gl = canvas.getContext("webgl", {
      alpha: options.alpha ?? false,
      antialias: true,
      depth: false,
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
    shaderProgram: SolidColorShaderProgram | TexturedShaderProgram
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

    if (layer.shape === "ellipse") {
      this.drawEllipseShape(layer);
      return;
    }

    if (layer.shape === "line") {
      this.drawLineShape(layer);
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
      this.quad.draw(this.solidColorShaderProgram);
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

      const width = layer.width * layer.scaleX;
      const height = layer.height * layer.scaleY;
      const strokeWidth = Math.min(layer.strokeWidth, width / 2, height / 2);

      this.drawRectangle({
        x: layer.x,
        y: layer.y,
        width,
        height: strokeWidth,
        rotation: layer.rotation
      });

      this.drawRectangle({
        x: layer.x,
        y: layer.y + height - strokeWidth,
        width,
        height: strokeWidth,
        rotation: layer.rotation
      });

      this.drawRectangle({
        x: layer.x,
        y: layer.y,
        width: strokeWidth,
        height,
        rotation: layer.rotation
      });

      this.drawRectangle({
        x: layer.x + width - strokeWidth,
        y: layer.y,
        width: strokeWidth,
        height,
        rotation: layer.rotation
      });
  }

  private drawLineShape(layer: ShapeLayer) {
    if (layer.strokeWidth <= 0 || layer.strokeColor[3] <= 0) {
      return;
    }

    const width = layer.width * layer.scaleX;
    const height = layer.height * layer.scaleY;
    const y = layer.y + height / 2;
    const strokeWidth = Math.max(1, layer.strokeWidth);

    this.solidColorShaderProgram.setColor([
      layer.strokeColor[0],
      layer.strokeColor[1],
      layer.strokeColor[2],
      layer.strokeColor[3] * layer.opacity
    ]);
    this.bindMask(layer, this.solidColorShaderProgram);

    this.drawRectangle({
      x: layer.x,
      y: y - strokeWidth / 2,
      width,
      height: strokeWidth,
      rotation: layer.rotation
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
    this.ellipseMesh.drawStroke(this.solidColorShaderProgram);
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
