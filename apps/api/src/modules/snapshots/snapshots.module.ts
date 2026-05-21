import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ProjectsModule } from '../projects/projects.module';
import { CollaborationModule } from '../collaboration/collaboration.module';
import { SnapshotsController } from './snapshots.controller';
import { SnapshotsService } from './snapshots.service';

@Module({
  imports: [PrismaModule, ProjectsModule, CollaborationModule],
  controllers: [SnapshotsController],
  providers: [SnapshotsService],
})
export class SnapshotsModule {}
