import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { SnapshotsService } from './snapshots.service';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';

@ApiTags('snapshots')
@ApiBearerAuth()
@Controller('shared-projects/:projectId/snapshots')
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  @Get()
  @ApiOperation({ summary: 'List snapshots (viewer+)' })
  listSnapshots(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.snapshotsService.listSnapshots(projectId, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create snapshot from current state (editor+)' })
  createSnapshot(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSnapshotDto,
  ) {
    return this.snapshotsService.createSnapshot(projectId, user, dto);
  }

  @Post(':snapshotId/restore')
  @ApiOperation({ summary: 'Restore snapshot (owner only)' })
  restoreSnapshot(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.snapshotsService.restoreSnapshot(projectId, snapshotId, user);
  }
}
