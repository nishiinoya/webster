import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { AuthUser } from '../../common/types/auth-user';

const COMMENT_SELECT = {
  id: true,
  projectId: true,
  parentCommentId: true,
  userId: true,
  content: true,
  xCoordinate: true,
  yCoordinate: true,
  isResolved: true,
  resolvedAt: true,
  resolvedBy: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: { id: true, email: true, displayName: true },
  },
  resolver: {
    select: { id: true, email: true, displayName: true },
  },
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly projectAccessService: ProjectAccessService,
  ) {}

  private async requireCommenter(
    projectId: string,
    userId: string,
  ): Promise<void> {
    if (!this.projectAccessService) {
      throw new ForbiddenException('Access control unavailable');
    }
    await this.projectAccessService.requireRole(
      projectId,
      userId,
      'commenter',
    );
  }

  private async resolveRole(projectId: string, userId: string) {
    if (!this.projectAccessService) return null;
    return this.projectAccessService.resolveRole(projectId, userId);
  }

  async listComments(projectId: string, currentUser: AuthUser) {
    await this.requireCommenter(projectId, currentUser.id);

    const allComments = await this.prisma.projectComment.findMany({
      where: { projectId, isDeleted: false },
      select: {
        ...COMMENT_SELECT,
        replies: {
          where: { isDeleted: false },
          select: COMMENT_SELECT,
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Return only root comments; replies are nested inside
    const rootComments = allComments.filter(
      (c) => c.parentCommentId === null,
    );

    return { comments: rootComments };
  }

  async createComment(
    projectId: string,
    dto: CreateCommentDto,
    currentUser: AuthUser,
  ) {
    await this.requireCommenter(projectId, currentUser.id);

    if (dto.parentCommentId) {
      const parent = await this.prisma.projectComment.findFirst({
        where: { id: dto.parentCommentId, projectId, isDeleted: false },
      });
      if (!parent) {
        throw new NotFoundException('Parent comment not found');
      }
    }

    const comment = await this.prisma.projectComment.create({
      data: {
        projectId,
        userId: currentUser.id,
        content: dto.content,
        xCoordinate: dto.x !== undefined ? dto.x : null,
        yCoordinate: dto.y !== undefined ? dto.y : null,
        parentCommentId: dto.parentCommentId ?? null,
      },
      select: COMMENT_SELECT,
    });

    return comment;
  }

  async updateComment(
    projectId: string,
    commentId: string,
    dto: UpdateCommentDto,
    currentUser: AuthUser,
  ) {
    await this.requireCommenter(projectId, currentUser.id);

    const comment = await this.prisma.projectComment.findFirst({
      where: { id: commentId, projectId, isDeleted: false },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const isAuthor = comment.userId === currentUser.id;
    const role = await this.resolveRole(projectId, currentUser.id);
    const isEditorPlus =
      role === 'owner' || role === 'editor';

    // Content can only be updated by the author
    if (dto.content !== undefined && !isAuthor) {
      throw new ForbiddenException('Only the author can edit comment content');
    }

    // isResolved can be set by editor+ or the author
    if (dto.isResolved !== undefined && !isEditorPlus && !isAuthor) {
      throw new ForbiddenException(
        'Only editor+ or the author can resolve comments',
      );
    }

    const now = new Date();
    const updated = await this.prisma.projectComment.update({
      where: { id: commentId },
      data: {
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.isResolved !== undefined && {
          isResolved: dto.isResolved,
          resolvedAt: dto.isResolved ? now : null,
          resolvedBy: dto.isResolved ? currentUser.id : null,
        }),
      },
      select: COMMENT_SELECT,
    });

    return updated;
  }

  async deleteComment(
    projectId: string,
    commentId: string,
    currentUser: AuthUser,
  ): Promise<void> {
    await this.requireCommenter(projectId, currentUser.id);

    const comment = await this.prisma.projectComment.findFirst({
      where: { id: commentId, projectId, isDeleted: false },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const isAuthor = comment.userId === currentUser.id;
    const role = await this.resolveRole(projectId, currentUser.id);
    const isEditorPlus = role === 'owner' || role === 'editor';

    if (!isAuthor && !isEditorPlus) {
      throw new ForbiddenException('Insufficient permissions to delete comment');
    }

    await this.prisma.projectComment.update({
      where: { id: commentId },
      data: { isDeleted: true },
    });
  }
}
