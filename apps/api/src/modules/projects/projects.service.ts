import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectAccessService, EffectiveRole } from './project-access.service';
import { WebsterProjectManifest } from '@webster/shared';

export interface ProjectSummary {
  id: string;
  projectName: string;
  mimeType: string;
  sizeBytes: string;
  updatedAt: Date;
  role: string;
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

  async findAll(userId: string): Promise<{ projects: ProjectSummary[] }> {
    const projects = await this.prisma.project.findMany({
      where: {
        isDeleted: false,
        OR: [
          { ownerId: userId },
          {
            accesses: {
              some: {
                sharedWithUserId: userId,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
          },
        ],
      },
      select: {
        id: true,
        projectName: true,
        mimeType: true,
        sizeBytes: true,
        updatedAt: true,
        ownerId: true,
        accesses: {
          where: { sharedWithUserId: userId },
          select: { permission: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const summaries: ProjectSummary[] = projects.map((p) => {
      let effectiveRole: EffectiveRole = null;
      if (p.ownerId === userId) {
        effectiveRole = 'owner';
      } else if (p.accesses.length > 0) {
        effectiveRole = p.accesses[0].permission as EffectiveRole;
      }
      return {
        id: p.id,
        projectName: p.projectName,
        mimeType: p.mimeType,
        sizeBytes: p.sizeBytes.toString(),
        updatedAt: p.updatedAt,
        role: this.projectAccess.toFrontendRole(effectiveRole),
      };
    });

    return { projects: summaries };
  }

  async findOne(projectId: string, userId: string): Promise<ProjectDetail> {
    const role = await this.projectAccess.resolveRole(projectId, userId);
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
