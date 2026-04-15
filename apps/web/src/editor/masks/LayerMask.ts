export type SerializedLayerMask = {
  data: string;
  enabled: boolean;
  height: number;
  id: string;
  width: number;
};

export class LayerMask {
  readonly id: string;
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  enabled: boolean;
  revision = 0;

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
    this.revision += 1;
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

    this.revision += 1;
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
