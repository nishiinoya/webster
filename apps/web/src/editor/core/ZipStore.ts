type ZipEntry = {
  data: Uint8Array;
  name: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const crcTable = createCrcTable();

export async function createZip(entries: ZipEntry[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const crc = crc32(entry.data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    localHeader.set(name, 30);
    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + entry.data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = byteLength(centralParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);

  return new Blob([...localParts, ...centralParts, endRecord].map(toBlobPart), {
    type: "application/vnd.webster.project"
  });
}

export async function readZip(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = new Map<string, Blob>();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const signature = view.getUint32(0, true);

    if (signature !== 0x04034b50) {
      break;
    }

    const compression = view.getUint16(8, true);
    const compressedSize = view.getUint32(18, true);
    const uncompressedSize = view.getUint32(22, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = textDecoder.decode(bytes.slice(nameStart, nameStart + nameLength));

    if (compression !== 0 || compressedSize !== uncompressedSize) {
      throw new Error("This .webster file uses compressed entries that are not supported yet.");
    }

    entries.set(name, new Blob([toBlobPart(bytes.slice(dataStart, dataEnd))]));
    offset = dataEnd;
  }

  return entries;
}

export async function readZipText(entries: Map<string, Blob>, path: string) {
  const entry = entries.get(path);

  if (!entry) {
    throw new Error(`Missing ${path} in .webster file.`);
  }

  return entry.text();
}

export function textEntry(name: string, text: string): ZipEntry {
  return {
    data: textEncoder.encode(text),
    name
  };
}

export async function blobEntry(name: string, blob: Blob): Promise<ZipEntry> {
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    name
  };
}

function byteLength(parts: Uint8Array[]) {
  return parts.reduce((total, part) => total + part.length, 0);
}

function toBlobPart(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}
