import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
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
  SharedProjectLoadResponse,
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
  ): Promise<SharedProjectLoadResponse> {
    if (!this.websterPackage) {
      throw new ServiceUnavailableException('WebsterPackageService is not available');
    }

    const { manifest, assets } = await this.websterPackage.unpack(buffer);

    // Derive project name from filename (strip .webster) or manifest template name
    const projectName =
      manifest.template?.name ||
      originalFilename.replace(/\.webster$/i, '').trim() ||
      'Untitled Project';

    if (!this.storage) {
      throw new ServiceUnavailableException('StorageService is not available');
    }

    // BUG 5 fix: upload all assets to S3 BEFORE opening the transaction so we
    // don't exceed Prisma's default 5 s transaction timeout on slow MinIO.
    type UploadedAsset = {
      assetPath: string;
      storageKey: string;
      sizeBytes: number;
      mimeType: string;
    };

    // We need the project id to build storage keys, so create a temporary
    // placeholder project first, then do a single transaction for DB writes only.
    const tempProject = await this.prisma.project.create({
      data: {
        ownerId: user.id,
        projectName,
        metadata: manifest as object,
        currentVersion: 0,
        mimeType: 'application/zip',
        sizeBytes: BigInt(buffer.length),
        storageKey: `projects/placeholder/manifest.json`,
      },
    });

    const projectId = tempProject.id;

    const uploadedAssets: UploadedAsset[] = [];

    for (const asset of assets) {
      const assetPath = asset.path.replace(/\\/g, '/');
      const storageKey = `projects/${projectId}/assets/${assetPath}`;
      let sizeBytes = asset.data.length;

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

      uploadedAssets.push({
        assetPath,
        storageKey,
        sizeBytes,
        mimeType: asset.mimeType,
      });
    }

    // DB-only transaction: update storageKey and insert asset rows
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: { storageKey: `projects/${projectId}/manifest.json` },
      });

      for (const ua of uploadedAssets) {
        await tx.projectAsset.create({
          data: {
            projectId,
            uploadedBy: user.id,
            assetName: ua.assetPath.split('/').at(-1) ?? ua.assetPath,
            storageKey: ua.storageKey,
            sizeBytes: BigInt(ua.sizeBytes),
            mimeType: ua.mimeType,
          },
        });
      }
    });

    // BUG 1 fix: return full SharedProjectLoadResponse instead of bare {projectId, projectName}
    return this.loadProject(projectId, user);
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

    const assets = await this.getProjectAssetReferences(projectId);

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

  /** POST /api/shared-projects/:projectId/save */
  async saveProject(
    projectId: string,
    user: AuthUser,
    body: {
      assetReferences?: SharedProjectAssetReference[];
      baseVersion?: number;
      clientId?: string;
      manifest?: WebsterProjectManifest;
    },
  ): Promise<SharedProjectLoadResponse> {
    if (!this.projectAccess) {
      throw new ServiceUnavailableException('ProjectAccessService is not available');
    }

    await this.projectAccess.requireRole(projectId, user.id, 'editor');

    if (!isWebsterProjectManifest(body.manifest)) {
      throw new BadRequestException('Invalid Webster project manifest');
    }

    if (!Number.isInteger(body.baseVersion) || body.baseVersion < 0) {
      throw new BadRequestException('baseVersion must be a non-negative integer');
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { currentVersion: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.currentVersion !== body.baseVersion) {
      throw new ConflictException(
        `Project changed before save completed. Server is at v${project.currentVersion}.`,
      );
    }

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        currentVersion: { increment: 1 },
        metadata: body.manifest as object,
      },
    });
    const assets = await this.getProjectAssetReferences(projectId);

    await this.roomService?.notifyProjectReplaced(
      projectId,
      body.manifest,
      updated.currentVersion,
      user,
      {
        assetReferences: mergeAssetReferences(assets, body.assetReferences ?? []),
        clientId: body.clientId,
        operationId: body.clientId ? `${body.clientId}:cloud-save:${updated.currentVersion}` : undefined,
        source: 'cloud-save',
      },
    );

    return this.loadProject(projectId, user);
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

  private async getProjectAssetReferences(projectId: string): Promise<SharedProjectAssetReference[]> {
    const dbAssets = await this.prisma.projectAsset.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    const assetsPrefix = `projects/${projectId}/assets/`;

    return dbAssets.map((asset) => {
      const assetPath = asset.storageKey.startsWith(assetsPrefix)
        ? asset.storageKey.slice(assetsPrefix.length)
        : asset.storageKey;
      const encodedPath = assetPath.split('/').map(encodeURIComponent).join('/');

      return {
        assetId: asset.id,
        assetPath,
        downloadUrl: `/shared-projects/${encodeURIComponent(projectId)}/assets/${encodedPath}`,
        mimeType: asset.mimeType ?? undefined,
      };
    });
  }
}

function isWebsterProjectManifest(value: unknown): value is WebsterProjectManifest {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { app?: unknown }).app === 'webster' &&
      (value as { version?: unknown }).version === 1 &&
      Array.isArray((value as { layers?: unknown }).layers) &&
      Boolean((value as { canvas?: unknown }).canvas),
  );
}

function mergeAssetReferences(
  storedAssets: SharedProjectAssetReference[],
  providedAssets: SharedProjectAssetReference[],
) {
  const byPath = new Map<string, SharedProjectAssetReference>();

  for (const asset of storedAssets) {
    byPath.set(asset.assetPath, asset);
  }

  for (const asset of providedAssets) {
    byPath.set(asset.assetPath, asset);
  }

  return [...byPath.values()];
}
