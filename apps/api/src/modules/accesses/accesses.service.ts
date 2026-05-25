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

    const [project, accesses, removedAccesses, pendingInvites, linkAccess] = await Promise.all([
      this.prisma.project.findFirst({
        where: { id: projectId, isDeleted: false },
        include: {
          owner: {
            select: { id: true, email: true, displayName: true },
          },
        },
      }),
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
      this.prisma.projectAccess.findMany({
        where: {
          projectId,
          revokedAt: { not: null },
          sharedWithUserId: { not: null },
        },
        include: {
          sharedWithUser: {
            select: { id: true, email: true, displayName: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
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

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return {
      owner: project.owner,
      accesses: accesses
        .filter((access) => access.sharedWithUser?.id !== project.owner.id)
        .map((access) => ({
          id: access.id,
          permission: access.permission,
          expiresAt: access.expiresAt?.toISOString() ?? null,
          createdAt: access.createdAt.toISOString(),
          updatedAt: access.updatedAt.toISOString(),
          sharedWithUser: access.sharedWithUser,
        })),
      removedAccesses: removedAccesses.map((access) => ({
        id: access.id,
        permission: access.permission,
        expiresAt: access.expiresAt?.toISOString() ?? null,
        createdAt: access.createdAt.toISOString(),
        updatedAt: access.updatedAt.toISOString(),
        revokedAt: access.revokedAt?.toISOString() ?? null,
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
            hasInviteLink: Boolean(linkAccess.tokenHash),
            inviteLink: null,
            updatedAt: linkAccess.updatedAt.toISOString(),
          }
        : {
            mode: 'restricted' as const,
            permission: 'viewer' as const,
            hasInviteLink: false,
            inviteLink: null,
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
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const targetUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, displayName: true },
    });

    if (targetUser) {
      if (targetUser.id === currentUser.id) {
        throw new BadRequestException('You already own this project.');
      }

      const activeAccess = await this.prisma.projectAccess.findFirst({
        where: { projectId, sharedWithUserId: targetUser.id, revokedAt: null },
        select: { id: true },
      });

      if (activeAccess) {
        throw new BadRequestException('This person already has access.');
      }
    }

    const existingPendingInvite = await this.prisma.projectInvite.findFirst({
      where: { projectId, invitedEmail: normalizedEmail, status: 'pending' },
      include: {
        invitedByUser: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    if (existingPendingInvite) {
      return {
        access: null,
        invite: serializeInvite(existingPendingInvite),
        inviteLink: null,
        message: 'This person already has a pending invite.',
      };
    }

    await this.entitlements?.assertCanShareProject(projectId, currentUser.id);

    const token = createInviteToken();
    const tokenHash = hashInviteToken(token);

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
      invite: serializeInvite(invite),
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
      include: {
        project: { select: { ownerId: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Access record not found');
    }

    if (existing.sharedWithUserId === existing.project.ownerId) {
      throw new BadRequestException('Project owner role cannot be changed here.');
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
      include: {
        project: { select: { ownerId: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Access record not found');
    }

    if (existing.sharedWithUserId === existing.project.ownerId) {
      throw new BadRequestException('Project owner access cannot be revoked here.');
    }

    await this.prisma.projectAccess.update({
      where: { id: accessId },
      data: { revokedAt: new Date() },
    });
  }

  async updateInvite(
    projectId: string,
    inviteId: string,
    dto: UpdateAccessDto,
    currentUser: AuthUser,
  ) {
    await this.requireOwner(projectId, currentUser.id);

    const invite = await this.prisma.projectInvite.findFirst({
      where: { id: inviteId, projectId, status: 'pending' },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    const updated = await this.prisma.projectInvite.update({
      where: { id: inviteId },
      data: {
        ...(dto.permission !== undefined && { permission: dto.permission }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
      },
      include: {
        invitedByUser: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    return serializeInvite(updated);
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
      dto.mode === 'anyone_with_link' && !existing?.tokenHash;

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
        hasInviteLink: Boolean(linkAccess.tokenHash),
        inviteLink: token ? buildInviteLink(appBaseUrl, token) : null,
        updatedAt: linkAccess.updatedAt.toISOString(),
      },
      inviteLink: token ? buildInviteLink(appBaseUrl, token) : null,
    };
  }

  async resetLinkAccess(
    projectId: string,
    currentUser: AuthUser,
    appBaseUrl?: string,
  ) {
    await this.requireOwner(projectId, currentUser.id);

    const existing = await this.prisma.projectLinkAccess.findUnique({
      where: { projectId },
    });

    if (!existing || existing.mode !== 'anyone_with_link') {
      throw new BadRequestException('Enable anyone-with-link before resetting the link.');
    }

    const token = createInviteToken();
    const linkAccess = await this.prisma.projectLinkAccess.update({
      where: { projectId },
      data: { tokenHash: hashInviteToken(token) },
    });

    return {
      linkAccess: {
        mode: linkAccess.mode,
        permission: linkAccess.permission,
        hasInviteLink: true,
        inviteLink: buildInviteLink(appBaseUrl, token),
        updatedAt: linkAccess.updatedAt.toISOString(),
      },
      inviteLink: buildInviteLink(appBaseUrl, token),
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

      await this.projectAccessService!.setUserAccess(
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
      include: { project: { select: { id: true, projectName: true, ownerId: true, isDeleted: true } } },
    });

    if (
      !linkAccess ||
      linkAccess.mode !== 'anyone_with_link' ||
      linkAccess.project.isDeleted
    ) {
      throw new NotFoundException('Invite not found');
    }

    if (linkAccess.project.ownerId === currentUser.id) {
      return {
        alreadyHasAccess: true,
        projectId: linkAccess.projectId,
        projectName: linkAccess.project.projectName,
        role: 'owner',
      };
    }

    const existingAccess = await this.prisma.projectAccess.findFirst({
      where: {
        projectId: linkAccess.projectId,
        sharedWithUserId: currentUser.id,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existingAccess?.revokedAt) {
      throw new ForbiddenException(
        'You were removed from this project. Ask the owner to invite you again.',
      );
    }

    if (existingAccess) {
      return {
        alreadyHasAccess: true,
        projectId: linkAccess.projectId,
        projectName: linkAccess.project.projectName,
        role: existingAccess.permission,
      };
    }

    const access = await this.projectAccessService!.setUserAccess(
      linkAccess.projectId,
      currentUser.id,
      linkAccess.permission,
      currentUser.id,
    );

    return {
      alreadyHasAccess: false,
      projectId: linkAccess.projectId,
      projectName: linkAccess.project.projectName,
      role: access.permission,
    };
  }
}

function serializeInvite(invite: {
  id: string;
  invitedEmail: string | null;
  invitedByUser: { id: string; email: string; displayName: string | null };
  permission: Permission;
  expiresAt: Date | null;
  createdAt: Date;
  status: string;
}) {
  return {
    id: invite.id,
    invitedEmail: invite.invitedEmail,
    invitedByUser: invite.invitedByUser,
    permission: invite.permission,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
    status: invite.status,
  };
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
