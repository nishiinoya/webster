import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { GrantAccessDto } from './dto/grant-access.dto';
import { UpdateAccessDto } from './dto/update-access.dto';
import { CreatePublicLinkDto } from './dto/create-public-link.dto';
import { AuthUser } from '../../common/types/auth-user';

@Injectable()
export class AccessesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly projectAccessService: ProjectAccessService,
  ) {}

  private async requireOwner(projectId: string, userId: string): Promise<void> {
    if (!this.projectAccessService) {
      throw new ForbiddenException('Access control unavailable');
    }
    await this.projectAccessService.requireRole(projectId, userId, 'owner');
  }

  async listAccesses(projectId: string, currentUser: AuthUser) {
    await this.requireOwner(projectId, currentUser.id);

    const accesses = await this.prisma.projectAccess.findMany({
      where: { projectId },
      include: {
        sharedWithUser: {
          select: { id: true, email: true, displayName: true },
        },
        creator: {
          select: { id: true, email: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return { accesses };
  }

  async grantAccess(
    projectId: string,
    dto: GrantAccessDto,
    currentUser: AuthUser,
  ) {
    await this.requireOwner(projectId, currentUser.id);

    // Normalize email so pending invites always compare equal to the address
    // that arrives later inside the JWT's email claim.
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Find or create pending user
    let targetUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!targetUser) {
      // Create pending row: auth0_subject will be set on first login
      targetUser = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          auth0Subject: `pending:${normalizedEmail}:${Date.now()}`,
        },
      });
    }

    const access = await this.prisma.projectAccess.create({
      data: {
        projectId,
        sharedWithUserId: targetUser.id,
        permission: dto.permission,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy: currentUser.id,
      },
      include: {
        sharedWithUser: {
          select: { id: true, email: true, displayName: true },
        },
        creator: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    return access;
  }

  async updateAccess(
    projectId: string,
    accessId: string,
    dto: UpdateAccessDto,
    currentUser: AuthUser,
  ) {
    await this.requireOwner(projectId, currentUser.id);

    const existing = await this.prisma.projectAccess.findFirst({
      where: { id: accessId, projectId },
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
        creator: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    return access;
  }

  async revokeAccess(
    projectId: string,
    accessId: string,
    currentUser: AuthUser,
  ): Promise<void> {
    await this.requireOwner(projectId, currentUser.id);

    const existing = await this.prisma.projectAccess.findFirst({
      where: { id: accessId, projectId },
    });

    if (!existing) {
      throw new NotFoundException('Access record not found');
    }

    await this.prisma.projectAccess.delete({ where: { id: accessId } });
  }

  async createPublicLink(
    projectId: string,
    dto: CreatePublicLinkDto,
    currentUser: AuthUser,
    requestUrl: string,
  ) {
    await this.requireOwner(projectId, currentUser.id);

    // Public link: sharedWithUserId = null
    const access = await this.prisma.projectAccess.create({
      data: {
        projectId,
        sharedWithUserId: null,
        permission: dto.permission,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy: currentUser.id,
      },
    });

    // Build the link using the request base URL (already protocol://host)
    const link = `${requestUrl}/api/projects/${projectId}?shareLink=${access.id}`;

    return { accessId: access.id, link };
  }
}
