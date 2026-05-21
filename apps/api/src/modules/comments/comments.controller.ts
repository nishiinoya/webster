import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';

@Controller('projects/:id/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  listComments(
    @Param('id') projectId: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.commentsService.listComments(projectId, currentUser);
  }

  @Post()
  createComment(
    @Param('id') projectId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.commentsService.createComment(projectId, dto, currentUser);
  }

  @Patch(':commentId')
  updateComment(
    @Param('id') projectId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.commentsService.updateComment(
      projectId,
      commentId,
      dto,
      currentUser,
    );
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteComment(
    @Param('id') projectId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.commentsService.deleteComment(
      projectId,
      commentId,
      currentUser,
    );
  }
}
