export type SerializedLayerMask = {
  data: string;
  enabled: boolean;
  height: number;
  id: string;
  width: number;
};

/** Raster layer mask storage plus dirty-region tracking. */
export type MaskDirtyRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export class LayerMask {
  readonly id: string;
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  enabled: boolean;
  revision = 0;
  private dirtyRect: MaskDirtyRect | null = null;

  constructor(options: {
    data?: Uint8Array;
    enabled?: boolean;
    height: number;
    id?: string;
    width: number;
  }) {
    this.id = options.id ?? crypto.randomUUID();
    this.width = Math.max(1, Math.round(options.width));
    this.height = Math.max(1, Math.round(options.height));
    this.enabled = options.enabled ?? true;
    this.data = options.data ?? new Uint8Array(this.width * this.height).fill(255);
  }

  static fromJSON(data: SerializedLayerMask) {
    return new LayerMask({
      data: decodeMaskData(data.data),
      enabled: data.enabled,
      height: data.height,
      id: data.id,
      width: data.width
    });
  }

  clear(value: 0 | 255) {
    this.data.fill(value);
    this.markDirty();
  }

  clone() {
    return new LayerMask({
      data: new Uint8Array(this.data),
      enabled: this.enabled,
      height: this.height,
      width: this.width
    });
  }

  invert() {
    for (let index = 0; index < this.data.length; index += 1) {
      this.data[index] = 255 - this.data[index];
    }

    this.markDirty();
  }

  markDirty(rect?: MaskDirtyRect) {
    this.revision += 1;

    if (!rect) {
      this.dirtyRect = { height: this.height, width: this.width, x: 0, y: 0 };
      return;
    }

    const nextRect = clampDirtyRect(rect, this.width, this.height);

    if (!nextRect) {
      return;
    }

    this.dirtyRect = this.dirtyRect ? unionDirtyRects(this.dirtyRect, nextRect) : nextRect;
  }

  takeDirtyRect() {
    const rect = this.dirtyRect;

    this.dirtyRect = null;

    return rect;
  }

  toJSON(): SerializedLayerMask {
    return {
      data: encodeMaskData(this.data),
      enabled: this.enabled,
      height: this.height,
      id: this.id,
      width: this.width
    };
  }
}

function clampDirtyRect(rect: MaskDirtyRect, maskWidth: number, maskHeight: number) {
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(maskWidth, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(maskHeight, Math.ceil(rect.y + rect.height));

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top
  };
}

function unionDirtyRects(a: MaskDirtyRect, b: MaskDirtyRect) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top
  };
}

function encodeMaskData(data: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < data.length; index += chunkSize) {
    binary += String.fromCharCode(...data.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function decodeMaskData(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
