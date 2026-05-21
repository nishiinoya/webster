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
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessesService } from './accesses.service';
import { GrantAccessDto } from './dto/grant-access.dto';
import { UpdateAccessDto } from './dto/update-access.dto';
import { CreatePublicLinkDto } from './dto/create-public-link.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';

@Controller('projects/:id/accesses')
export class AccessesController {
  constructor(private readonly accessesService: AccessesService) {}

  @Get()
  listAccesses(
    @Param('id') projectId: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.accessesService.listAccesses(projectId, currentUser);
  }

  @Post()
  grantAccess(
    @Param('id') projectId: string,
    @Body() dto: GrantAccessDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.accessesService.grantAccess(projectId, dto, currentUser);
  }

  @Patch(':accessId')
  updateAccess(
    @Param('id') projectId: string,
    @Param('accessId') accessId: string,
    @Body() dto: UpdateAccessDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.accessesService.updateAccess(
      projectId,
      accessId,
      dto,
      currentUser,
    );
  }

  @Delete(':accessId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeAccess(
    @Param('id') projectId: string,
    @Param('accessId') accessId: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.accessesService.revokeAccess(projectId, accessId, currentUser);
  }

  @Post('public-link')
  createPublicLink(
    @Param('id') projectId: string,
    @Body() dto: CreatePublicLinkDto,
    @CurrentUser() currentUser: AuthUser,
    @Req() req: Request,
  ) {
    return this.accessesService.createPublicLink(
      projectId,
      dto,
      currentUser,
      `${req.protocol}://${req.get('host')}`,
    );
  }
}
