import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { AuthUser } from '../../common/types/auth-user';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getMe(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(user, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(user, file);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.usersService.removeAvatar(user);
  }

  @Public()
  @Post('me/resend-verification')
  resendVerificationEmail(@Headers('authorization') authorization?: string) {
    return this.usersService.resendVerificationEmail(authorization);
  }

  // Public so it can be used directly in <img src>. Avatars are low-sensitivity
  // and the user id is an unguessable UUID. We respond directly here (rather
  // than letting the exception filter handle a throw through @Res()) so a
  // missing avatar returns a clean 404 instead of leaving the socket open.
  @Public()
  @Get(':id/avatar')
  async getAvatar(@Param('id') id: string, @Res() res: Response) {
    let stream;
    try {
      stream = await this.usersService.streamAvatar(id);
    } catch {
      res.status(404).json({ statusCode: 404, message: 'Avatar not found' });
      return;
    }

    res.setHeader('Content-Type', stream.mimeType);
    if (stream.size > 0) {
      res.setHeader('Content-Length', stream.size);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');

    stream.body.on('error', () => {
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.end();
      }
    });
    stream.body.pipe(res);
  }
}
