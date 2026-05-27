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
      data: decodeMaskData(data.data, Math.max(1, data.width) * Math.max(1, data.height)),
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
  const rleData = encodeMaskDataRle(data);
  const rawData = encodeBytesBase64(data);

  return rleData.length < rawData.length ? rleData : rawData;
}

function encodeBytesBase64(data: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < data.length; index += chunkSize) {
    binary += String.fromCharCode(...data.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function encodeMaskDataRle(data: Uint8Array) {
  const output: number[] = [];
  let index = 0;

  while (index < data.length) {
    const value = data[index];
    let count = 1;

    while (index + count < data.length && data[index + count] === value && count < 0xffff) {
      count += 1;
    }

    output.push(value, count & 0xff, (count >> 8) & 0xff);
    index += count;
  }

  return `rle8:${encodeBytesBase64(new Uint8Array(output))}`;
}

function decodeMaskData(data: string, expectedLength: number) {
  if (data.startsWith("rle8:")) {
    return decodeMaskDataRle(data.slice(5), expectedLength);
  }

  return decodeRawMaskData(data);
}

function decodeRawMaskData(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeMaskDataRle(data: string, expectedLength: number) {
  const encodedRuns = decodeRawMaskData(data);
  const output = new Uint8Array(expectedLength);
  let outputIndex = 0;

  for (let index = 0; index + 2 < encodedRuns.length && outputIndex < output.length; index += 3) {
    const value = encodedRuns[index];
    const count = encodedRuns[index + 1] | (encodedRuns[index + 2] << 8);
    const end = Math.min(output.length, outputIndex + count);

    output.fill(value, outputIndex, end);
    outputIndex = end;
  }

  if (outputIndex < output.length) {
    output.fill(255, outputIndex);
  }

  return output;
}
