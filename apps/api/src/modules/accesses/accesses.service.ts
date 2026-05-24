import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { GrantAccessDto } from './dto/grant-access.dto';
import { UpdateAccessDto } from './dto/update-access.dto';
import { UpdateLinkAccessDto } from './dto/update-link-access.dto';
import { AuthUser } from '../../common/types/auth-user';

type Permission = 'viewer' | 'commenter' | 'editor';
type LinkMode = 'restricted' | 'anyone_with_link';

@Injectable()
export class AccessesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly projectAccessService: ProjectAccessService,
    @Optional() private readonly entitlements: EntitlementsService | null,
  ) {}

  private async requireOwner(projectId: string, userId: string): Promise<void> {
    if (!this.projectAccessService) {
      throw new ForbiddenException('Access control unavailable');
    }
    await this.projectAccessService.requireRole(projectId, userId, 'owner');
  }

  async listAccesses(projectId: string, currentUser: AuthUser) {
    await this.requireOwner(projectId, currentUser.id);

    const [accesses, pendingInvites, linkAccess] = await Promise.all([
      this.prisma.projectAccess.findMany({
        where: {
          projectId,
          revokedAt: null,
          sharedWithUserId: { not: null },
        },
        include: {
          sharedWithUser: {
            select: { id: true, email: true, displayName: true },
          },
          creator: {
            select: { id: true, email: true, displayName: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.projectInvite.findMany({
        where: { projectId, status: 'pending' },
        include: {
          invitedByUser: {
            select: { id: true, email: true, displayName: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.projectLinkAccess.findUnique({
        where: { projectId },
      }),
    ]);

    return {
      accesses: accesses.map((access) => ({
        id: access.id,
        permission: access.permission,
        expiresAt: access.expiresAt?.toISOString() ?? null,
        createdAt: access.createdAt.toISOString(),
        updatedAt: access.updatedAt.toISOString(),
        sharedWithUser: access.sharedWithUser,
      })),
      pendingInvites: pendingInvites.map((invite) => ({
        id: invite.id,
        invitedEmail: invite.invitedEmail,
        invitedByUser: invite.invitedByUser,
        permission: invite.permission,
        expiresAt: invite.expiresAt?.toISOString() ?? null,
        createdAt: invite.createdAt.toISOString(),
        status: invite.status,
      })),
      linkAccess: linkAccess
        ? {
            mode: linkAccess.mode,
            permission: linkAccess.permission,
            updatedAt: linkAccess.updatedAt.toISOString(),
          }
        : {
            mode: 'restricted' as const,
            permission: 'viewer' as const,
            updatedAt: null,
          },
    };
  }

  async grantAccess(
    projectId: string,
    dto: GrantAccessDto,
    currentUser: AuthUser,
    appBaseUrl?: string,
  ) {
    await this.requireOwner(projectId, currentUser.id);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { id: true, projectName: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const normalizedEmail = normalizeEmail(dto.email);
    const token = createInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const targetUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, displayName: true },
    });

    const isNewCollaborator = targetUser
      ? !(await this.prisma.projectAccess.findFirst({
          where: { projectId, sharedWithUserId: targetUser.id, revokedAt: null },
          select: { id: true },
        }))
      : !(await this.prisma.projectInvite.findFirst({
          where: { projectId, invitedEmail: normalizedEmail, status: 'pending' },
          select: { id: true },
        }));
    if (isNewCollaborator) {
      await this.entitlements?.assertCanShareProject(projectId, currentUser.id);
    }

    if (targetUser) {
      const access = await this.projectAccessService!.upsertUserAccess(
        projectId,
        targetUser.id,
        dto.permission,
        currentUser.id,
      );

      await this.prisma.projectInvite.create({
        data: {
          projectId,
          invitedEmail: normalizedEmail,
          invitedByUserId: currentUser.id,
          permission: dto.permission,
          tokenHash,
          status: 'accepted',
          expiresAt,
          acceptedByUserId: targetUser.id,
          acceptedAt: new Date(),
        },
      });

      return {
        access: {
          id: access.id,
          permission: access.permission,
          expiresAt: access.expiresAt?.toISOString() ?? null,
          createdAt: access.createdAt.toISOString(),
          updatedAt: access.updatedAt.toISOString(),
          sharedWithUser: targetUser,
        },
        invite: null,
        inviteLink: null,
      };
    }

    const invite = await this.prisma.projectInvite.create({
      data: {
        projectId,
        invitedEmail: normalizedEmail,
        invitedByUserId: currentUser.id,
        permission: dto.permission,
        tokenHash,
        expiresAt,
      },
      include: {
        invitedByUser: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    return {
      access: null,
      invite: {
        id: invite.id,
        invitedEmail: invite.invitedEmail,
        invitedByUser: invite.invitedByUser,
        permission: invite.permission,
        expiresAt: invite.expiresAt?.toISOString() ?? null,
        createdAt: invite.createdAt.toISOString(),
        status: invite.status,
      },
      inviteLink: buildInviteLink(appBaseUrl, token),
    };
  }

  async updateAccess(
    projectId: string,
    accessId: string,
    dto: UpdateAccessDto,
    currentUser: AuthUser,
  ) {
    await this.requireOwner(projectId, currentUser.id);

    const existing = await this.prisma.projectAccess.findFirst({
      where: { id: accessId, projectId, revokedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Access record not found');
    }

    const access = await this.prisma.projectAccess.update({
      where: { id: accessId },
      data: {
        ...(dto.permission !== undefined && { permission: dto.permission }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
      },
      include: {
        sharedWithUser: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    return {
      id: access.id,
      permission: access.permission,
      expiresAt: access.expiresAt?.toISOString() ?? null,
      createdAt: access.createdAt.toISOString(),
      updatedAt: access.updatedAt.toISOString(),
      sharedWithUser: access.sharedWithUser,
    };
  }

  async revokeAccess(
    projectId: string,
    accessId: string,
    currentUser: AuthUser,
  ): Promise<void> {
    await this.requireOwner(projectId, currentUser.id);

    const existing = await this.prisma.projectAccess.findFirst({
      where: { id: accessId, projectId, revokedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Access record not found');
    }

    await this.prisma.projectAccess.update({
      where: { id: accessId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeInvite(
    projectId: string,
    inviteId: string,
    currentUser: AuthUser,
  ): Promise<void> {
    await this.requireOwner(projectId, currentUser.id);

    const invite = await this.prisma.projectInvite.findFirst({
      where: { id: inviteId, projectId, status: 'pending' },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    await this.prisma.projectInvite.update({
      where: { id: inviteId },
      data: { status: 'revoked' },
    });
  }

  async updateLinkAccess(
    projectId: string,
    dto: UpdateLinkAccessDto,
    currentUser: AuthUser,
    appBaseUrl?: string,
  ) {
    await this.requireOwner(projectId, currentUser.id);

    const existing = await this.prisma.projectLinkAccess.findUnique({
      where: { projectId },
    });

    let token: string | null = null;
    const shouldGenerateToken =
      dto.mode === 'anyone_with_link' &&
      (!existing?.tokenHash || existing.mode !== 'anyone_with_link');

    const tokenHash = shouldGenerateToken
      ? hashInviteToken((token = createInviteToken()))
      : dto.mode === 'restricted'
        ? null
        : existing?.tokenHash ?? null;

    const linkAccess = await this.prisma.projectLinkAccess.upsert({
      where: { projectId },
      create: {
        projectId,
        mode: dto.mode,
        permission: dto.permission,
        tokenHash,
      },
      update: {
        mode: dto.mode,
        permission: dto.permission,
        tokenHash,
      },
    });

    return {
      linkAccess: {
        mode: linkAccess.mode,
        permission: linkAccess.permission,
        updatedAt: linkAccess.updatedAt.toISOString(),
      },
      inviteLink: token ? buildInviteLink(appBaseUrl, token) : null,
    };
  }

  async createPublicLink(
    projectId: string,
    dto: { permission: Permission; expiresAt?: string },
    currentUser: AuthUser,
    requestUrl: string,
  ) {
    const result = await this.updateLinkAccess(
      projectId,
      { mode: 'anyone_with_link', permission: dto.permission },
      currentUser,
      requestUrl,
    );

    return {
      link: result.inviteLink,
      linkAccess: result.linkAccess,
    };
  }

  async acceptInviteToken(token: string, currentUser: AuthUser) {
    const trimmed = token.trim();

    if (!trimmed) {
      throw new BadRequestException('Invite token is required');
    }

    const tokenHash = hashInviteToken(trimmed);
    const now = new Date();
    const invite = await this.prisma.projectInvite.findUnique({
      where: { tokenHash },
      include: { project: { select: { id: true, projectName: true, isDeleted: true } } },
    });

    if (invite) {
      if (
        invite.status !== 'pending' ||
        invite.project.isDeleted ||
        (invite.expiresAt && invite.expiresAt <= now)
      ) {
        throw new NotFoundException('Invite not found');
      }

      if (
        invite.invitedEmail &&
        invite.invitedEmail !== normalizeEmail(currentUser.email)
      ) {
        throw new ForbiddenException('This invite is for a different email address');
      }

      await this.projectAccessService!.upsertUserAccess(
        invite.projectId,
        currentUser.id,
        invite.permission,
        invite.invitedByUserId,
      );

      await this.prisma.projectInvite.update({
        where: { id: invite.id },
        data: {
          acceptedAt: now,
          acceptedByUserId: currentUser.id,
          status: 'accepted',
        },
      });

      return {
        projectId: invite.projectId,
        projectName: invite.project.projectName,
        role: invite.permission,
      };
    }

    const linkAccess = await this.prisma.projectLinkAccess.findUnique({
      where: { tokenHash },
      include: { project: { select: { id: true, projectName: true, isDeleted: true } } },
    });

    if (
      !linkAccess ||
      linkAccess.mode !== 'anyone_with_link' ||
      linkAccess.project.isDeleted
    ) {
      throw new NotFoundException('Invite not found');
    }

    await this.projectAccessService!.upsertUserAccess(
      linkAccess.projectId,
      currentUser.id,
      linkAccess.permission,
      currentUser.id,
    );

    return {
      projectId: linkAccess.projectId,
      projectName: linkAccess.project.projectName,
      role: linkAccess.permission,
    };
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createInviteToken() {
  return randomBytes(32).toString('base64url');
}

function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function buildInviteLink(appBaseUrl: string | undefined, token: string) {
  const baseUrl = appBaseUrl?.replace(/\/+$/u, '') ?? '';

  return `${baseUrl}/invite/${encodeURIComponent(token)}`;
}
