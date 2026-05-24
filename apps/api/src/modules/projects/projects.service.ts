import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectAccessService } from './project-access.service';
import { WebsterProjectManifest } from '@webster/shared';

export interface ProjectSummary {
  id: string;
  projectName: string;
  updatedAt: string;
  role: 'owner' | 'editor' | 'viewer' | 'commenter';
  owner?: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

export interface ProjectInviteSummary {
  id: string;
  projectId: string;
  projectName: string;
  invitedEmail: string | null;
  invitedByUser: {
    id: string;
    email: string;
    displayName: string | null;
  };
  permission: 'viewer' | 'commenter' | 'editor';
  expiresAt: string | null;
  createdAt: string;
}

export interface ProjectDetail {
  id: string;
  projectName: string;
  mimeType: string;
  sizeBytes: string;
  metadata: WebsterProjectManifest | null;
  currentVersion: number;
  createdAt: Date;
  updatedAt: Date;
  role: string;
  ownerId: string;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async findAll(userId: string): Promise<{
    owned: ProjectSummary[];
    sharedWithMe: ProjectSummary[];
    pendingInvites: ProjectInviteSummary[];
  }> {
    const currentUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    const ownedProjects = await this.prisma.project.findMany({
      where: { ownerId: userId, isDeleted: false },
      select: {
        id: true,
        projectName: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const sharedProjects = await this.prisma.project.findMany({
      where: {
        isDeleted: false,
        ownerId: { not: userId },
        accesses: {
          some: {
            sharedWithUserId: userId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
      },
      select: {
        id: true,
        projectName: true,
        updatedAt: true,
        owner: {
          select: { id: true, email: true, displayName: true },
        },
        accesses: {
          where: {
            sharedWithUserId: userId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { permission: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const pendingInviteRows = await this.prisma.projectInvite.findMany({
      where: {
        status: 'pending',
        invitedEmail: currentUser.email.toLowerCase(),
        project: { isDeleted: false },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        project: { select: { projectName: true } },
        invitedByUser: {
          select: { id: true, email: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      owned: ownedProjects.map((p) => ({
        id: p.id,
        projectName: p.projectName,
        updatedAt: p.updatedAt.toISOString(),
        role: 'owner',
      })),
      sharedWithMe: sharedProjects.map((p) => {
        const permission = p.accesses
          .map((access) => access.permission)
          .sort((a, b) => permissionRank(b) - permissionRank(a))[0];

        return {
          id: p.id,
          projectName: p.projectName,
          updatedAt: p.updatedAt.toISOString(),
          role: (permission ?? 'viewer') as 'editor' | 'viewer' | 'commenter',
          owner: p.owner,
        };
      }),
      pendingInvites: pendingInviteRows.map((invite) => ({
        id: invite.id,
        projectId: invite.projectId,
        projectName: invite.project.projectName,
        invitedEmail: invite.invitedEmail,
        invitedByUser: invite.invitedByUser,
        permission: invite.permission,
        expiresAt: invite.expiresAt?.toISOString() ?? null,
        createdAt: invite.createdAt.toISOString(),
      })),
    };
  }

  async acceptPendingInvite(
    inviteId: string,
    userId: string,
  ): Promise<{ projectId: string; projectName: string; role: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    const invite = await this.prisma.projectInvite.findFirst({
      where: {
        id: inviteId,
        invitedEmail: user.email.toLowerCase(),
        status: 'pending',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { project: { select: { projectName: true } } },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    await this.projectAccess.upsertUserAccess(
      invite.projectId,
      userId,
      invite.permission,
      invite.invitedByUserId,
    );

    await this.prisma.projectInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
        acceptedByUserId: userId,
        status: 'accepted',
      },
    });

    return {
      projectId: invite.projectId,
      projectName: invite.project.projectName,
      role: invite.permission,
    };
  }

  async findOne(projectId: string, userId: string): Promise<ProjectDetail> {
    const role = await this.projectAccess.resolveOrGrantLinkRole(projectId, userId);
    if (role === null) {
      throw new NotFoundException('Project not found');
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return {
      id: project.id,
      projectName: project.projectName,
      mimeType: project.mimeType,
      sizeBytes: project.sizeBytes.toString(),
      metadata: project.metadata as WebsterProjectManifest | null,
      currentVersion: project.currentVersion,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      role: this.projectAccess.toFrontendRole(role),
      ownerId: project.ownerId,
    };
  }

  async create(
    userId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectDetail> {
    const project = await this.prisma.project.create({
      data: {
        ownerId: userId,
        projectName: dto.projectName,
        storageKey: `projects/pending/manifest.json`,
        metadata: dto.manifest ? (dto.manifest as object) : null,
        currentVersion: 0,
        isDeleted: false,
      },
    });

    // Update storageKey to use actual id
    const updated = await this.prisma.project.update({
      where: { id: project.id },
      data: { storageKey: `projects/${project.id}/manifest.json` },
    });

    return {
      id: updated.id,
      projectName: updated.projectName,
      mimeType: updated.mimeType,
      sizeBytes: updated.sizeBytes.toString(),
      metadata: updated.metadata as WebsterProjectManifest | null,
      currentVersion: updated.currentVersion,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      role: 'owner',
      ownerId: updated.ownerId,
    };
  }

  async update(
    projectId: string,
    userId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectDetail> {
    await this.projectAccess.requireRole(projectId, userId, 'editor');

    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.projectName !== undefined && { projectName: dto.projectName }),
      },
    });

    const role = await this.projectAccess.resolveRole(projectId, userId);

    return {
      id: project.id,
      projectName: project.projectName,
      mimeType: project.mimeType,
      sizeBytes: project.sizeBytes.toString(),
      metadata: project.metadata as WebsterProjectManifest | null,
      currentVersion: project.currentVersion,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      role: this.projectAccess.toFrontendRole(role),
      ownerId: project.ownerId,
    };
  }

  async remove(projectId: string, userId: string): Promise<void> {
    const role = await this.projectAccess.resolveRole(projectId, userId);

    if (role === null) {
      throw new NotFoundException('Project not found');
    }

    if (role !== 'owner') {
      throw new ForbiddenException('Only the owner can delete this project');
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { isDeleted: true },
    });
  }
}

function permissionRank(permission: 'viewer' | 'commenter' | 'editor') {
  if (permission === 'editor') return 3;
  if (permission === 'commenter') return 2;
  return 1;
}
