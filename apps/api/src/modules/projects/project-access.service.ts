import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProjectRole } from '@webster/shared';

export type EffectiveRole = 'owner' | 'editor' | 'viewer' | 'commenter' | null;

const ROLE_RANK: Record<NonNullable<EffectiveRole>, number> = {
  owner: 4,
  editor: 3,
  viewer: 2,
  commenter: 1,
};

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveRole(projectId: string, userId: string): Promise<EffectiveRole> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { ownerId: true },
    });

    if (!project) return null;

    if (project.ownerId === userId) return 'owner';

    const access = await this.prisma.projectAccess.findFirst({
      where: {
        projectId,
        sharedWithUserId: userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { permission: true },
    });

    if (!access) return null;

    return access.permission as EffectiveRole;
  }

  async requireRole(
    projectId: string,
    userId: string,
    min: EffectiveRole,
  ): Promise<void> {
    const role = await this.resolveRole(projectId, userId);

    if (role === null) {
      throw new NotFoundException('Project not found');
    }

    if (min === null) return;

    const userRank = ROLE_RANK[role];
    const minRank = ROLE_RANK[min];

    if (userRank < minRank) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  toFrontendRole(role: EffectiveRole): ProjectRole {
    if (role === 'owner') return 'owner';
    if (role === 'editor') return 'editor';
    // 'viewer' and 'commenter' both map to 'viewer' on the frontend
    return 'viewer';
  }
}
