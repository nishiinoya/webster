import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProjectRole } from '@webster/shared';

export type EffectiveRole = 'owner' | 'editor' | 'viewer' | 'commenter' | null;

const ACCESS_PRIORITY: Record<Exclude<EffectiveRole, null>, number> = {
  owner: 4,
  editor: 3,
  commenter: 2,
  viewer: 1,
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

    const accesses = await this.prisma.projectAccess.findMany({
      where: {
        projectId,
        sharedWithUserId: userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { permission: true },
    });

    if (accesses.length === 0) return null;

    const access = accesses.sort(
      (a, b) => ACCESS_PRIORITY[b.permission] - ACCESS_PRIORITY[a.permission],
    )[0];

    return access.permission as EffectiveRole;
  }

  async resolveOrGrantLinkRole(
    projectId: string,
    userId: string,
  ): Promise<EffectiveRole> {
    return this.resolveRole(projectId, userId);
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

    if (!roleAllows(role, min)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  toFrontendRole(role: EffectiveRole): ProjectRole {
    if (role === 'owner') return 'owner';
    if (role === 'editor') return 'editor';
    if (role === 'commenter') return 'commenter';
    return 'viewer';
  }

  async upsertUserAccess(
    projectId: string,
    userId: string,
    permission: 'viewer' | 'commenter' | 'editor',
    createdBy: string,
  ) {
    const existing = await this.prisma.projectAccess.findFirst({
      where: { projectId, sharedWithUserId: userId },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return this.prisma.projectAccess.update({
        where: { id: existing.id },
        data: {
          permission: highestPermission(existing.permission, permission),
          revokedAt: null,
          expiresAt: null,
        },
      });
    }

    return this.prisma.projectAccess.create({
      data: {
        projectId,
        sharedWithUserId: userId,
        permission,
        createdBy,
      },
    });
  }

  async setUserAccess(
    projectId: string,
    userId: string,
    permission: 'viewer' | 'commenter' | 'editor',
    createdBy: string,
  ) {
    const existing = await this.prisma.projectAccess.findFirst({
      where: { projectId, sharedWithUserId: userId },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      return this.prisma.projectAccess.update({
        where: { id: existing.id },
        data: {
          permission,
          revokedAt: null,
          expiresAt: null,
        },
      });
    }

    return this.prisma.projectAccess.create({
      data: {
        projectId,
        sharedWithUserId: userId,
        permission,
        createdBy,
      },
    });
  }
}

function roleAllows(
  role: Exclude<EffectiveRole, null>,
  min: Exclude<EffectiveRole, null>,
) {
  if (min === 'viewer') {
    return true;
  }

  if (min === 'commenter') {
    return role === 'owner' || role === 'editor' || role === 'commenter';
  }

  if (min === 'editor') {
    return role === 'owner' || role === 'editor';
  }

  return role === 'owner';
}

function highestPermission(
  current: 'viewer' | 'commenter' | 'editor',
  next: 'viewer' | 'commenter' | 'editor',
) {
  return ACCESS_PRIORITY[next] > ACCESS_PRIORITY[current] ? next : current;
}
