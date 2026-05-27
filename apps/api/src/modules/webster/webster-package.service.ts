import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require('adm-zip') as typeof import('adm-zip');
import type { WebsterProjectManifest } from '@webster/shared';

export type UnpackedAsset = {
  path: string;
  mimeType: string;
  data: Buffer;
};

export type UnpackedPackage = {
  manifest: WebsterProjectManifest;
  assets: UnpackedAsset[];
};

@Injectable()
export class WebsterPackageService {
  async unpack(zipBuffer: Buffer): Promise<UnpackedPackage> {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    const manifestEntry = entries.find((e) => e.entryName === 'manifest.json');
    if (!manifestEntry) {
      throw new Error('Invalid .webster package: manifest.json not found');
    }

    const manifest = JSON.parse(
      manifestEntry.getData().toString('utf-8'),
    ) as WebsterProjectManifest;

    const assets: UnpackedAsset[] = [];
    for (const entry of entries) {
      if (entry.entryName === 'manifest.json' || entry.isDirectory) {
        continue;
      }

      const assetPath = entry.entryName.replace(/\\/g, '/');
      const data = entry.getData();
      const mimeType = guessMimeType(assetPath);

      assets.push({ path: assetPath, mimeType, data });
    }

    return { manifest, assets };
  }

  async pack(
    manifest: WebsterProjectManifest,
    assets: { path: string; data: Buffer; mimeType: string }[],
  ): Promise<Buffer> {
    const zip = new AdmZip();

    zip.addFile(
      'manifest.json',
      Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'),
    );

    for (const asset of assets) {
      const entryPath = asset.path.replace(/\\/g, '/');
      zip.addFile(entryPath, asset.data);
    }

    return zip.toBuffer();
  }
}

function guessMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    json: 'application/json',
    bin: 'application/octet-stream',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
  };
  return map[ext] ?? 'application/octet-stream';
}
