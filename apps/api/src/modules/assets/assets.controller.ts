import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AssetsService } from './assets.service';
import { UploadAssetsMetadataDto } from './dto/upload-assets.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

@Controller('shared-projects/:projectId/assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  @UseInterceptors(AnyFilesInterceptor())
  async uploadAssets(
    @Param('projectId') projectId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    const rawMetadata = (req.body as Record<string, unknown>)['metadata'];
    if (!rawMetadata) {
      throw new BadRequestException('Missing "metadata" field');
    }

    let parsedMetadata: unknown;
    try {
      parsedMetadata = typeof rawMetadata === 'string'
        ? JSON.parse(rawMetadata)
        : rawMetadata;
    } catch {
      throw new BadRequestException('Invalid JSON in "metadata" field');
    }

    const dto = plainToInstance(UploadAssetsMetadataDto, parsedMetadata);
    const errors = validateSync(dto);
    if (errors.length > 0) {
      throw new BadRequestException(
        errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; '),
      );
    }

    const assets = await this.assetsService.uploadAssets(
      projectId,
      user.id,
      dto.assets,
      files ?? [],
    );

    return { assets };
  }

  @Get('*')
  async getAsset(
    @Param('projectId') projectId: string,
    @Param('0') wildcardPath: string,
    @Res() res: Response,
  ) {
    // Reject path traversal
    if (!wildcardPath || wildcardPath.includes('..')) {
      throw new BadRequestException('Invalid asset path');
    }

    const assetPath = wildcardPath.replace(/\\/g, '/');
    const { body, mimeType, size } = await this.assetsService.streamAsset(
      projectId,
      assetPath,
    );

    res.setHeader('Content-Type', mimeType);
    if (size > 0) {
      res.setHeader('Content-Length', size);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    body.pipe(res);
  }
}
