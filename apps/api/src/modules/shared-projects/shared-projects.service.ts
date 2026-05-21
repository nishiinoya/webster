import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { WebsterPackageService } from '../webster/webster-package.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { RoomService } from '../collaboration/room.service';
import { AuthUser } from '../../common/types/auth-user';
import type {
  SharedProjectStatePayload,
  SharedProjectAssetReference,
  SharedProjectSnapshotSummary,
  WebsterProjectManifest,
} from '@webster/shared';
import { Readable } from 'stream';

@Injectable()
export class SharedProjectsService {
  private readonly logger = new Logger(SharedProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly storage: StorageService | null,
    @Optional() private readonly websterPackage: WebsterPackageService | null,
    @Optional() private readonly projectAccess: ProjectAccessService | null,
    @Optional() private readonly roomService: RoomService | null,
  ) {}

  /** POST /api/shared-projects/import-webster */
  async importWebster(
    user: AuthUser,
    buffer: Buffer,
    originalFilename: string,
  ): Promise<{ projectId: string; projectName: string }> {
    if (!this.websterPackage) {
      throw new ServiceUnavailableException('WebsterPackageService is not available');
    }

    const { manifest, assets } = await this.websterPackage.unpack(buffer);

    // Derive project name from filename (strip .webster) or manifest template name
    const projectName =
      manifest.template?.name ||
      originalFilename.replace(/\.webster$/i, '').trim() ||
      'Untitled Project';

    // Wrap all writes in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // INSERT project row
      const project = await tx.project.create({
        data: {
          ownerId: user.id,
          projectName,
          metadata: manifest as object,
          currentVersion: 0,
          mimeType: 'application/zip',
          sizeBytes: BigInt(buffer.length),
          storageKey: `projects/placeholder/manifest.json`, // will be updated after we have the id
        },
      });

      // Update storageKey with the real id
      await tx.project.update({
        where: { id: project.id },
        data: { storageKey: `projects/${project.id}/manifest.json` },
      });

      // Upload each asset to S3 and insert project_assets rows
      for (const asset of assets) {
        const assetPath = asset.path.replace(/\\/g, '/');
        const storageKey = `projects/${project.id}/assets/${assetPath}`;
        let sizeBytes = asset.data.length;

        if (this.storage) {
          try {
            const uploadResult = await this.storage.putObject(
              storageKey,
              asset.data,
              asset.mimeType,
            );
            sizeBytes = uploadResult.size;
          } catch (err) {
            this.logger.warn(
              `Failed to upload asset ${assetPath}: ${(err as Error).message}`,
            );
          }
        } else {
          this.logger.warn('StorageService not available — skipping S3 upload for assets');
        }

        await tx.projectAsset.create({
          data: {
            projectId: project.id,
            uploadedBy: user.id,
            assetName: assetPath.split('/').at(-1) ?? assetPath,
            storageKey,
            sizeBytes: BigInt(sizeBytes),
            mimeType: asset.mimeType,
          },
        });
      }

      return { projectId: project.id, projectName };
    });

    return result;
  }

  /** GET /api/shared-projects/:projectId */
  async loadProject(
    projectId: string,
    user: AuthUser,
  ): Promise<SharedProjectStatePayload> {
    // Resolve role — 404 if no access at all
    const internalRole = this.projectAccess
      ? await this.projectAccess.resolveRole(projectId, user.id)
      : null;

    if (!internalRole) {
      throw new NotFoundException('Project not found');
    }

    const role = this.projectAccess
      ? this.projectAccess.toFrontendRole(internalRole)
      : 'viewer';

    // Load project
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Load all project_assets
    const dbAssets = await this.prisma.projectAsset.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    const assets: SharedProjectAssetReference[] = dbAssets.map((a) => {
      // storageKey = projects/<id>/assets/<assetPath>
      // Extract relative assetPath after 'assets/'
      const assetsPrefix = `projects/${projectId}/assets/`;
      const assetPath = a.storageKey.startsWith(assetsPrefix)
        ? a.storageKey.slice(assetsPrefix.length)
        : a.storageKey;

      return {
        assetId: a.id,
        assetPath,
        downloadUrl: `/api/shared-projects/${encodeURIComponent(projectId)}/assets/${assetPath}`,
        mimeType: a.mimeType ?? undefined,
      };
    });

    // Load top-50 snapshot summaries
    const snapshotRows = await this.prisma.projectSnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { creator: { select: { displayName: true, email: true } } },
    });

    const snapshots: SharedProjectSnapshotSummary[] = snapshotRows.map((s) => ({
      id: s.id,
      version: (s.stateData as Record<string, unknown> | null)?.version as number ?? 0,
      message: s.snapshotName ?? null,
      authorName: s.creator.displayName ?? s.creator.email ?? null,
      createdAt: s.createdAt.toISOString(),
      type: 'manual' as const,
    }));

    // Get presence from RoomService (optional)
    const users = this.roomService ? this.roomService.getPresence(projectId) : [];

    return {
      projectId,
      projectName: project.projectName,
      snapshot: (project.metadata ?? {}) as WebsterProjectManifest,
      currentVersion: project.currentVersion,
      role,
      assets,
      snapshots,
      users,
    };
  }

  /** GET /api/shared-projects/:projectId/export-webster */
  async exportWebster(
    projectId: string,
    user: AuthUser,
  ): Promise<{ buffer: Buffer; projectName: string }> {
    if (!this.projectAccess) {
      throw new ServiceUnavailableException('ProjectAccessService is not available');
    }
    if (!this.storage) {
      throw new ServiceUnavailableException('StorageService is not available');
    }
    if (!this.websterPackage) {
      throw new ServiceUnavailableException('WebsterPackageService is not available');
    }

    // Require editor+ access
    const internalRole = await this.projectAccess.resolveRole(projectId, user.id);
    if (!internalRole) {
      throw new NotFoundException('Project not found');
    }

    const roleRank: Record<string, number> = {
      owner: 4,
      editor: 3,
      viewer: 2,
      commenter: 1,
    };
    if ((roleRank[internalRole] ?? 0) < roleRank['editor']) {
      throw new ForbiddenException('Insufficient permissions — editor role required');
    }

    // Load project
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const manifest = (project.metadata ?? {}) as WebsterProjectManifest;

    // Load all assets from DB
    const dbAssets = await this.prisma.projectAsset.findMany({
      where: { projectId },
    });

    // Fetch each asset binary from S3
    const packedAssets: { path: string; data: Buffer; mimeType: string }[] = [];

    await Promise.all(
      dbAssets.map(async (a) => {
        try {
          const { body, mimeType } = await this.storage!.getObject(a.storageKey);

          // Collect stream into buffer
          const chunks: Buffer[] = [];
          for await (const chunk of body as Readable) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
          }
          const data = Buffer.concat(chunks);

          // Derive relative path
          const assetsPrefix = `projects/${projectId}/assets/`;
          const assetPath = a.storageKey.startsWith(assetsPrefix)
            ? a.storageKey.slice(assetsPrefix.length)
            : a.storageKey;

          packedAssets.push({ path: assetPath, data, mimeType: a.mimeType ?? mimeType });
        } catch (err) {
          this.logger.warn(
            `Could not fetch asset ${a.storageKey} for export: ${(err as Error).message}`,
          );
        }
      }),
    );

    const buffer = await this.websterPackage.pack(manifest, packedAssets);

    return { buffer, projectName: project.projectName };
  }
}
