import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { SharedProjectsService } from './shared-projects.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Public } from '../../common/auth/public.decorator';
import type {
  SharedProjectAssetReference,
  SharedProjectLoadResponse,
  SharedProjectStatePayload,
  WebsterProjectManifest,
} from '@webster/shared';

type SaveSharedProjectBody = {
  assetReferences?: SharedProjectAssetReference[];
  baseVersion?: number;
  clientId?: string;
  manifest?: WebsterProjectManifest;
};

@Controller('shared-projects')
export class SharedProjectsController {
  constructor(private readonly sharedProjectsService: SharedProjectsService) {}

  /**
   * POST /api/shared-projects/import-webster
   * Auth required. Accepts multipart upload — takes the first file.
   */
  @Post('import-webster')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AnyFilesInterceptor())
  async importWebster(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<SharedProjectLoadResponse> {
    const file = files?.[0];
    if (!file) {
      const { BadRequestException } = await import('@nestjs/common');
      throw new BadRequestException('No file uploaded');
    }

    return this.sharedProjectsService.importWebster(
      user,
      file.buffer,
      file.originalname,
    );
  }

  /**
   * GET /api/shared-projects/:projectId/public
   * Anonymous viewer access for projects whose anyone-with-link role is Viewer.
   */
  @Public()
  @Get(':projectId/public')
  async loadPublicViewerProject(
    @Param('projectId') projectId: string,
  ): Promise<SharedProjectStatePayload> {
    return this.sharedProjectsService.loadPublicViewerProject(projectId);
  }

  @Public()
  @Get('public-invite/:token')
  async loadPublicViewerInvite(
    @Param('token') token: string,
  ): Promise<SharedProjectStatePayload> {
    return this.sharedProjectsService.loadPublicViewerInvite(token);
  }

  /**
   * GET /api/shared-projects/:projectId
   * viewer+ access required.
   */
  @Get(':projectId')
  async loadProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<SharedProjectStatePayload> {
    return this.sharedProjectsService.loadProject(projectId, user);
  }

  /**
   * POST /api/shared-projects/:projectId/save
   * Explicit cloud save. The realtime socket is still responsible for live
   * collaboration; this endpoint persists a complete editor state snapshot.
   */
  @Post(':projectId/save')
  @HttpCode(HttpStatus.OK)
  async saveProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: SaveSharedProjectBody,
  ): Promise<SharedProjectLoadResponse> {
    return this.sharedProjectsService.saveProject(projectId, user, body);
  }

  /**
   * GET /api/shared-projects/:projectId/export-webster
   * editor+ access required. Streams a .webster zip file.
   */
  @Get(':projectId/export-webster')
  async exportWebster(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, projectName } = await this.sharedProjectsService.exportWebster(
      projectId,
      user,
    );

    const safeFilename = projectName.replace(/[^\w\s.-]/g, '_').trim() || 'project';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}.webster"`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
