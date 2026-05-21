import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { WebsterModule } from '../webster/webster.module';
import { ProjectsModule } from '../projects/projects.module';
import { CollaborationModule } from '../collaboration/collaboration.module';
import { SharedProjectsController } from './shared-projects.controller';
import { SharedProjectsService } from './shared-projects.service';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    WebsterModule,
    ProjectsModule,
    CollaborationModule,
  ],
  controllers: [SharedProjectsController],
  providers: [SharedProjectsService],
})
export class SharedProjectsModule {}
