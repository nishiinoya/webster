import { ImageLayer } from "../../layers/ImageLayer";
/** WebGL texture lifetime management for images and layer masks. */
import { LayerMask } from "../../masks/LayerMask";

export class TextureManager {
  private readonly imageTextureRevisions = new Map<string, number>();
  private readonly maskTextureSizes = new Map<string, { height: number; width: number }>();
  private readonly maskTextureRevisions = new Map<string, number>();
  private readonly textures = new Map<string, WebGLTexture>();


  constructor(private readonly gl: WebGLRenderingContext) {}

  getTexture(layer: ImageLayer) {
    const existingTexture = this.textures.get(layer.id);
    const existingRevision = this.imageTextureRevisions.get(layer.id);

    if (existingTexture && existingRevision === layer.revision) {
      return existingTexture;
    }

    const texture = existingTexture ?? this.gl.createTexture();

    if (!texture) {
      throw new Error("Unable to create WebGL texture.");
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      layer.image
    );

    this.textures.set(layer.id, texture);
    this.imageTextureRevisions.set(layer.id, layer.revision);

    return texture;
  }

  getMaskTexture(mask: LayerMask) {
    const existingTexture = this.textures.get(mask.id);
    const existingRevision = this.maskTextureRevisions.get(mask.id);
    const existingSize = this.maskTextureSizes.get(mask.id);

    if (existingTexture && existingRevision === mask.revision) {
      return existingTexture;
    }

    const texture = existingTexture ?? this.gl.createTexture();

    if (!texture) {
      throw new Error("Unable to create WebGL mask texture.");
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.configureMaskTexture();

    const canUploadDirtyRect =
      existingTexture &&
      existingSize?.width === mask.width &&
      existingSize.height === mask.height;
    const dirtyRect = canUploadDirtyRect ? mask.takeDirtyRect() : null;
    const dirtyArea = dirtyRect ? dirtyRect.width * dirtyRect.height : Number.POSITIVE_INFINITY;
    const fullArea = mask.width * mask.height;

    if (dirtyRect && dirtyArea < fullArea * 0.45) {
      const dirtyData = copyMaskDirtyRect(mask, dirtyRect);

      this.gl.texSubImage2D(
        this.gl.TEXTURE_2D,
        0,
        dirtyRect.x,
        mask.height - dirtyRect.y - dirtyRect.height,
        dirtyRect.width,
        dirtyRect.height,
        this.gl.LUMINANCE,
        this.gl.UNSIGNED_BYTE,
        dirtyData
      );
    } else {
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.LUMINANCE,
        mask.width,
        mask.height,
        0,
        this.gl.LUMINANCE,
        this.gl.UNSIGNED_BYTE,
        mask.data
      );
    }

    this.textures.set(mask.id, texture);
    this.maskTextureRevisions.set(mask.id, mask.revision);
    this.maskTextureSizes.set(mask.id, { height: mask.height, width: mask.width });

    return texture;
  }

  dispose() {
    for (const texture of this.textures.values()) {
      this.gl.deleteTexture(texture);
    }

    this.textures.clear();
    this.imageTextureRevisions.clear();
    this.maskTextureSizes.clear();
    this.maskTextureRevisions.clear();
  }

  private configureMaskTexture() {
    // Raw LUMINANCE masks are single-byte rows.
    this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 1);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
  }
}

function copyMaskDirtyRect(
  mask: LayerMask,
  rect: { height: number; width: number; x: number; y: number }
) {
  const data = new Uint8Array(rect.width * rect.height);

  for (let row = 0; row < rect.height; row += 1) {
    const sourceStart = (rect.y + row) * mask.width + rect.x;
    const targetStart = row * rect.width;

    data.set(mask.data.subarray(sourceStart, sourceStart + rect.width), targetStart);
  }

  return data;
}
