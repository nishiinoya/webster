export type ImageExportBackground = "checkerboard" | "transparent" | "white";

export type ImageExportFormat = "jpeg" | "pdf" | "png";

/**
 * Normalizes background choices to formats that support them.
 */
export function getExportRenderBackground(
  format: ImageExportFormat,
  background: ImageExportBackground
): ImageExportBackground {
  if (format !== "png" && background === "transparent") {
    return "white";
  }

  return background;
}

/**
 * Converts a canvas into a blob and rejects when the browser export fails.
 */
export function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Unable to export image."));
      },
      mimeType,
      quality
    );
  });
}

/**
 * Wraps a JPEG export inside a minimal single-page PDF document.
 */
export async function createPdfFromJpeg(jpeg: Blob, width: number, height: number) {
  const imageBytes = new Uint8Array(await jpeg.arrayBuffer());
  const contentStream = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects: PdfObject[] = [
    { body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
    },
    {
      body: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>`,
      stream: imageBytes
    },
    {
      body: `<< /Length ${contentStream.length} >>`,
      stream: asciiBytes(contentStream)
    }
  ];
  const parts: PdfPart[] = ["%PDF-1.4\n"];
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(sumByteLengths(parts));
    parts.push(`${index + 1} 0 obj\n${objects[index].body}\n`);

    const stream = objects[index].stream;

    if (stream) {
      parts.push("stream\n");
      parts.push(stream);
      parts.push("\nendstream\n");
    }

    parts.push("endobj\n");
  }

  const xrefOffset = sumByteLengths(parts);
  const xrefRows = offsets.map((offset, index) =>
    index === 0 ? "0000000000 65535 f " : `${String(offset).padStart(10, "0")} 00000 n `
  );

  parts.push(
    `xref\n0 ${offsets.length}\n${xrefRows.join("\n")}\ntrailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return new Blob(parts.map(toBlobPart), { type: "application/pdf" });
}

type PdfObject = {
  body: string;
  stream?: Uint8Array;
};

type PdfPart = string | Uint8Array;

function asciiBytes(value: string) {
  return new TextEncoder().encode(value);
}

function sumByteLengths(parts: PdfPart[]) {
  return parts.reduce((total, part) => total + getPdfPartLength(part), 0);
}

function getPdfPartLength(part: PdfPart) {
  return typeof part === "string" ? asciiBytes(part).length : part.byteLength;
}

function toBlobPart(part: PdfPart): BlobPart {
  if (typeof part === "string") {
    return part;
  }

  const copy = new Uint8Array(part.byteLength);

  copy.set(part);

  return copy.buffer;
}
