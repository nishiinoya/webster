import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { RoomService } from '../collaboration/room.service';
import { AuthUser } from '../../common/types/auth-user';
import {
  SharedProjectSnapshotSummary,
  SharedProjectLoadResponse,
  SharedProjectAssetReference,
} from '@webster/shared';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly projectAccessService: ProjectAccessService | null,
    @Optional() private readonly roomService: RoomService | null,
  ) {}

  /** GET /api/shared-projects/:projectId/snapshots — viewer+ */
  async listSnapshots(
    projectId: string,
    user: AuthUser,
  ): Promise<{ snapshots: SharedProjectSnapshotSummary[] }> {
    await this.requireRole(projectId, user.id, 'viewer');

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { currentVersion: true },
    });

    if (!project) throw new NotFoundException('Project not found');

    const rows = await this.prisma.projectSnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { creator: { select: { displayName: true, email: true } } },
    });

    const snapshots: SharedProjectSnapshotSummary[] = rows.map((s) => ({
      id: s.id,
      version: (s.stateData as any)?.version ?? 0,
      message: s.snapshotName ?? null,
      authorName: s.creator.displayName ?? s.creator.email ?? null,
      createdAt: s.createdAt.toISOString(),
      type: 'manual' as const,
    }));

    return { snapshots };
  }

  /** POST /api/shared-projects/:projectId/snapshots — editor+ */
  async createSnapshot(
    projectId: string,
    user: AuthUser,
    dto: CreateSnapshotDto,
  ): Promise<{ snapshot: SharedProjectSnapshotSummary }> {
    await this.requireRole(projectId, user.id, 'editor');

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { metadata: true, currentVersion: true },
    });

    if (!project) throw new NotFoundException('Project not found');

    const snapshot = await this.prisma.projectSnapshot.create({
      data: {
        projectId,
        createdBy: user.id,
        snapshotName: dto.message ?? null,
        stateData: project.metadata ?? {},
      },
      include: { creator: { select: { displayName: true, email: true } } },
    });

    return {
      snapshot: {
        id: snapshot.id,
        version: project.currentVersion,
        message: snapshot.snapshotName ?? null,
        authorName: snapshot.creator.displayName ?? snapshot.creator.email ?? null,
        createdAt: snapshot.createdAt.toISOString(),
        type: 'manual',
      },
    };
  }

  /** POST /api/shared-projects/:projectId/snapshots/:snapshotId/restore — owner only */
  async restoreSnapshot(
    projectId: string,
    snapshotId: string,
    user: AuthUser,
  ): Promise<SharedProjectLoadResponse> {
    await this.requireRole(projectId, user.id, 'owner');

    const snapshot = await this.prisma.projectSnapshot.findFirst({
      where: { id: snapshotId, projectId },
    });

    if (!snapshot) throw new NotFoundException('Snapshot not found');

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        metadata: snapshot.stateData ?? {},
        currentVersion: { increment: 1 },
      },
    });

    const newManifest = (updated.metadata ?? {}) as any;
    const newVersion = updated.currentVersion;

    const assetsPrefix = `projects/${projectId}/assets/`;
    const dbAssets = await this.prisma.projectAsset.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    const assets: SharedProjectAssetReference[] = dbAssets.map((a) => {
      const assetPath = a.storageKey.startsWith(assetsPrefix)
        ? a.storageKey.slice(assetsPrefix.length)
        : a.storageKey;
      const encodedPath = assetPath.split('/').map(encodeURIComponent).join('/');

      return {
        assetId: a.id,
        assetPath,
        downloadUrl: `/shared-projects/${encodeURIComponent(projectId)}/assets/${encodedPath}`,
        mimeType: a.mimeType ?? undefined,
      };
    });

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

    const users = this.roomService ? this.roomService.getPresence(projectId) : [];

    await this.roomService?.notifyProjectReplaced(
      projectId,
      newManifest,
      newVersion,
      user,
      {
        assetReferences: assets,
        source: 'restore',
      },
    );

    return {
      projectId,
      projectName: updated.projectName,
      currentVersion: newVersion,
      role: 'owner',
      snapshot: newManifest,
      assets,
      snapshots,
      users,
    };
  }

  private async requireRole(
    projectId: string,
    userId: string,
    min: 'viewer' | 'editor' | 'owner',
  ): Promise<void> {
    if (!this.projectAccessService) return; // graceful degrade if not wired

    const role = await this.projectAccessService.resolveRole(projectId, userId);

    if (!role) throw new NotFoundException('Project not found');

    const rank = { viewer: 1, commenter: 1, editor: 2, owner: 3 } as Record<string, number>;
    const minRank = rank[min] ?? 0;

    if ((rank[role] ?? 0) < minRank) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }
}
