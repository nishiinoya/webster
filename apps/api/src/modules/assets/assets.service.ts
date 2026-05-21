import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ProjectAccessService } from '../projects/project-access.service';
import type { SharedProjectAssetReference } from '@webster/shared';
import { AssetMetadataItemDto } from './dto/upload-assets.dto';
import { Readable } from 'stream';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly storage: StorageService | null,
    @Optional() private readonly projectAccess: ProjectAccessService | null,
  ) {}

  async uploadAssets(
    projectId: string,
    userId: string,
    metadataItems: AssetMetadataItemDto[],
    files: Express.Multer.File[],
  ): Promise<SharedProjectAssetReference[]> {
    // Build a map from fileField → file
    const fileMap = new Map<string, Express.Multer.File>();
    for (const file of files) {
      fileMap.set(file.fieldname, file);
    }

    const results: SharedProjectAssetReference[] = [];

    for (const item of metadataItems) {
      const file = fileMap.get(item.fileField);
      if (!file) {
        throw new BadRequestException(
          `File field "${item.fileField}" not found in upload`,
        );
      }

      // Sanitize assetPath
      const assetPath = item.assetPath.replace(/\\/g, '/');
      if (assetPath.includes('..')) {
        throw new BadRequestException(
          `Asset path "${assetPath}" contains forbidden traversal sequence`,
        );
      }

      const storageKey = `projects/${projectId}/assets/${assetPath}`;
      const mimeType = item.mimeType || file.mimetype || 'application/octet-stream';

      let size = file.size;

      if (this.storage) {
        const result = await this.storage.putObject(
          storageKey,
          file.buffer,
          mimeType,
        );
        size = result.size;
      } else {
        this.logger.warn('StorageService not available — skipping S3 upload');
      }

      // UPSERT project_assets (unique on projectId + storageKey)
      await this.prisma.projectAsset.upsert({
        where: {
          projectId_storageKey: {
            projectId,
            storageKey,
          },
        },
        update: {
          mimeType,
          sizeBytes: BigInt(size),
          assetName: assetPath.split('/').at(-1) ?? assetPath,
        },
        create: {
          projectId,
          uploadedBy: userId,
          assetName: assetPath.split('/').at(-1) ?? assetPath,
          storageKey,
          sizeBytes: BigInt(size),
          mimeType,
        },
      });

      const downloadUrl = `/api/shared-projects/${encodeURIComponent(projectId)}/assets/${assetPath}`;

      results.push({
        assetId: item.assetId,
        assetPath,
        downloadUrl,
        mimeType,
      });
    }

    return results;
  }

  async streamAsset(
    projectId: string,
    assetPath: string,
  ): Promise<{ body: Readable; mimeType: string; size: number }> {
    const storageKey = `projects/${projectId}/assets/${assetPath}`;

    // Look up mime type from DB
    const asset = await this.prisma.projectAsset.findFirst({
      where: { projectId, storageKey },
      select: { mimeType: true },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (!this.storage) {
      throw new NotFoundException('Storage service unavailable');
    }

    const { body, size } = await this.storage.getObject(storageKey);
    return {
      body,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      size,
    };
  }
}
