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
import { UpdateLinkAccessDto } from './dto/update-link-access.dto';
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
    @Req() req: Request,
  ) {
    return this.accessesService.grantAccess(
      projectId,
      dto,
      currentUser,
      getAppBaseUrl(req),
    );
  }

  @Patch('link-access')
  updateLinkAccess(
    @Param('id') projectId: string,
    @Body() dto: UpdateLinkAccessDto,
    @CurrentUser() currentUser: AuthUser,
    @Req() req: Request,
  ) {
    return this.accessesService.updateLinkAccess(
      projectId,
      dto,
      currentUser,
      getAppBaseUrl(req),
    );
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

  @Delete('invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(
    @Param('id') projectId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.accessesService.revokeInvite(projectId, inviteId, currentUser);
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
      getAppBaseUrl(req),
    );
  }
}

@Controller('invites')
export class InviteAcceptController {
  constructor(private readonly accessesService: AccessesService) {}

  @Post('accept')
  acceptInvite(
    @Body() body: { token?: string },
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.accessesService.acceptInviteToken(body.token ?? '', currentUser);
  }
}

function getAppBaseUrl(req: Request) {
  const corsOrigin = process.env.CORS_ORIGIN?.split(',')[0]?.trim();

  if (corsOrigin) {
    return corsOrigin.replace(/\/+$/u, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}
