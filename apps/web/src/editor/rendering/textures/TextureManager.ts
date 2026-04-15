import { ImageLayer } from "../../layers/ImageLayer";
import { LayerMask } from "../../masks/LayerMask";

export class TextureManager {
  private readonly maskTextureRevisions = new Map<string, number>();
  private readonly textures = new Map<string, WebGLTexture>();

  constructor(private readonly gl: WebGLRenderingContext) {}

  getTexture(layer: ImageLayer) {
    const existingTexture = this.textures.get(layer.id);

    if (existingTexture) {
      return existingTexture;
    }

    const texture = this.gl.createTexture();

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

    return texture;
  }

  getMaskTexture(mask: LayerMask) {
    const existingTexture = this.textures.get(mask.id);
    const existingRevision = this.maskTextureRevisions.get(mask.id);

    if (existingTexture && existingRevision === mask.revision) {
      return existingTexture;
    }

    const texture = existingTexture ?? this.gl.createTexture();

    if (!texture) {
      throw new Error("Unable to create WebGL mask texture.");
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
      this.gl.LUMINANCE,
      mask.width,
      mask.height,
      0,
      this.gl.LUMINANCE,
      this.gl.UNSIGNED_BYTE,
      mask.data
    );

    this.textures.set(mask.id, texture);
    this.maskTextureRevisions.set(mask.id, mask.revision);

    return texture;
  }

  dispose() {
    for (const texture of this.textures.values()) {
      this.gl.deleteTexture(texture);
    }

    this.textures.clear();
    this.maskTextureRevisions.clear();
  }
}
