import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { ProjectComment as SharedProjectComment } from '@webster/shared';
import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { RoomService } from '../collaboration/room.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { AuthUser } from '../../common/types/auth-user';

const COMMENT_INCLUDE = {
  author: {
    select: { id: true, email: true, displayName: true },
  },
  resolver: {
    select: { id: true, email: true, displayName: true },
  },
} as const;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly projectAccessService: ProjectAccessService,
    @Optional() private readonly roomService: RoomService | null,
  ) {}

  private async requireViewer(projectId: string, userId: string): Promise<void> {
    if (!this.projectAccessService) {
      throw new ForbiddenException('Access control unavailable');
    }
    await this.projectAccessService.requireRole(projectId, userId, 'viewer');
  }

  private async requireCommenter(
    projectId: string,
    userId: string,
  ): Promise<void> {
    if (!this.projectAccessService) {
      throw new ForbiddenException('Access control unavailable');
    }
    await this.projectAccessService.requireRole(projectId, userId, 'commenter');
  }

  private async resolveRole(projectId: string, userId: string) {
    if (!this.projectAccessService) return null;
    return this.projectAccessService.resolveRole(projectId, userId);
  }

  async listComments(projectId: string, currentUser: AuthUser) {
    await this.requireViewer(projectId, currentUser.id);

    const comments = await this.prisma.projectComment.findMany({
      where: { projectId, deletedAt: null, isDeleted: false },
      include: {
        ...COMMENT_INCLUDE,
        replies: {
          where: { deletedAt: null, isDeleted: false },
          include: COMMENT_INCLUDE,
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      comments: comments
        .filter((comment) => comment.parentCommentId === null)
        .map(serializeComment),
    };
  }

  async createComment(
    projectId: string,
    dto: CreateCommentDto,
    currentUser: AuthUser,
  ) {
    await this.requireCommenter(projectId, currentUser.id);

    if (dto.parentCommentId) {
      const parent = await this.prisma.projectComment.findFirst({
        where: {
          id: dto.parentCommentId,
          projectId,
          deletedAt: null,
          isDeleted: false,
        },
      });
      if (!parent) {
        throw new NotFoundException('Parent comment not found');
      }
    }

    const text = dto.content.trim();
    const comment = await this.prisma.projectComment.create({
      data: {
        projectId,
        authorUserId: currentUser.id,
        text,
        x: dto.x !== undefined ? dto.x : null,
        y: dto.y !== undefined ? dto.y : null,
        localX: dto.localX !== undefined ? dto.localX : null,
        localY: dto.localY !== undefined ? dto.localY : null,
        layerId: dto.layerId ?? null,
        parentCommentId: dto.parentCommentId ?? null,
      },
      include: COMMENT_INCLUDE,
    });

    const serialized = serializeComment({ ...comment, replies: [] });
    this.broadcast(projectId, 'comment:create', { comment: serialized, projectId });

    return serialized;
  }

  async updateComment(
    projectId: string,
    commentId: string,
    dto: UpdateCommentDto,
    currentUser: AuthUser,
  ) {
    await this.requireCommenter(projectId, currentUser.id);

    const comment = await this.prisma.projectComment.findFirst({
      where: { id: commentId, projectId, deletedAt: null, isDeleted: false },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const isAuthor = comment.authorUserId === currentUser.id;
    const role = await this.resolveRole(projectId, currentUser.id);
    const isEditorPlus = role === 'owner' || role === 'editor';
    const nextText = dto.text ?? dto.content;

    if (nextText !== undefined && (!isAuthor || comment.status === 'resolved')) {
      throw new ForbiddenException(
        'Only the author can edit an unresolved comment',
      );
    }

    if (dto.isResolved !== undefined && !isEditorPlus && !isAuthor) {
      throw new ForbiddenException(
        'Only editor+ or the author can resolve comments',
      );
    }

    const now = new Date();
    const updated = await this.prisma.projectComment.update({
      where: { id: commentId },
      data: {
        ...(nextText !== undefined && { text: nextText.trim() }),
        ...(dto.isResolved !== undefined && {
          status: dto.isResolved ? 'resolved' : 'open',
          isResolved: dto.isResolved,
          resolvedAt: dto.isResolved ? now : null,
          resolvedByUserId: dto.isResolved ? currentUser.id : null,
        }),
      },
      include: COMMENT_INCLUDE,
    });

    const serialized = serializeComment({ ...updated, replies: [] });
    this.broadcast(projectId, 'comment:update', { comment: serialized, projectId });

    return serialized;
  }

  async deleteComment(
    projectId: string,
    commentId: string,
    currentUser: AuthUser,
  ): Promise<void> {
    await this.requireCommenter(projectId, currentUser.id);

    const comment = await this.prisma.projectComment.findFirst({
      where: { id: commentId, projectId, deletedAt: null, isDeleted: false },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const isAuthor = comment.authorUserId === currentUser.id;
    const role = await this.resolveRole(projectId, currentUser.id);
    const isEditorPlus = role === 'owner' || role === 'editor';

    if ((!isAuthor || comment.status === 'resolved') && !isEditorPlus) {
      throw new ForbiddenException('Insufficient permissions to delete comment');
    }

    await this.prisma.projectComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date(), isDeleted: true },
    });

    this.broadcast(projectId, 'comment:delete', { commentId, projectId });
  }

  async resolveComment(
    projectId: string,
    commentId: string,
    currentUser: AuthUser,
  ) {
    return this.setResolved(projectId, commentId, currentUser, true);
  }

  async reopenComment(
    projectId: string,
    commentId: string,
    currentUser: AuthUser,
  ) {
    return this.setResolved(projectId, commentId, currentUser, false);
  }

  private async setResolved(
    projectId: string,
    commentId: string,
    currentUser: AuthUser,
    resolved: boolean,
  ) {
    await this.requireCommenter(projectId, currentUser.id);

    const comment = await this.prisma.projectComment.findFirst({
      where: { id: commentId, projectId, deletedAt: null, isDeleted: false },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const role = await this.resolveRole(projectId, currentUser.id);
    const isEditorPlus = role === 'owner' || role === 'editor';
    const isAuthor = comment.authorUserId === currentUser.id;

    if (!isEditorPlus && !isAuthor) {
      throw new ForbiddenException(
        'Only editor+ or the author can update comment status',
      );
    }

    const updated = await this.prisma.projectComment.update({
      where: { id: commentId },
      data: {
        status: resolved ? 'resolved' : 'open',
        isResolved: resolved,
        resolvedAt: resolved ? new Date() : null,
        resolvedByUserId: resolved ? currentUser.id : null,
      },
      include: COMMENT_INCLUDE,
    });

    const serialized = serializeComment({ ...updated, replies: [] });
    this.broadcast(projectId, resolved ? 'comment:resolve' : 'comment:reopen', {
      comment: serialized,
      projectId,
    });

    return serialized;
  }

  private broadcast(
    projectId: string,
    type:
      | 'comment:create'
      | 'comment:update'
      | 'comment:delete'
      | 'comment:resolve'
      | 'comment:reopen',
    payload: { comment?: SharedProjectComment; commentId?: string; projectId: string },
  ) {
    this.roomService?.broadcastToRoom(projectId, { type, payload });
  }
}

type CommentRow = {
  author: { id: string; email: string; displayName: string | null };
  authorUserId: string;
  createdAt: Date;
  deletedAt: Date | null;
  id: string;
  layerId: string | null;
  localX: unknown;
  localY: unknown;
  parentCommentId: string | null;
  projectId: string;
  replies?: CommentRow[];
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  resolver: { id: string; email: string; displayName: string | null } | null;
  status: 'open' | 'resolved';
  text: string;
  updatedAt: Date;
  x: unknown;
  y: unknown;
};

function serializeComment(comment: CommentRow): SharedProjectComment {
  return {
    author: comment.author,
    authorUserId: comment.authorUserId,
    createdAt: comment.createdAt.toISOString(),
    deletedAt: comment.deletedAt?.toISOString() ?? null,
    id: comment.id,
    layerId: comment.layerId,
    localX: decimalToNumber(comment.localX),
    localY: decimalToNumber(comment.localY),
    parentCommentId: comment.parentCommentId,
    projectId: comment.projectId,
    replies: comment.replies?.map(serializeComment) ?? [],
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
    resolvedByUser: comment.resolver,
    resolvedByUserId: comment.resolvedByUserId,
    status: comment.status,
    text: comment.text,
    updatedAt: comment.updatedAt.toISOString(),
    x: decimalToNumber(comment.x),
    y: decimalToNumber(comment.y),
  };
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
}
