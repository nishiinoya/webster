import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { ProjectsModule } from '../projects/projects.module';
import { CollaborationModule } from '../collaboration/collaboration.module';

@Module({
  imports: [ProjectsModule, CollaborationModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
