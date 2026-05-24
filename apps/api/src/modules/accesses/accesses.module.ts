import { Module } from '@nestjs/common';
import { AccessesController, InviteAcceptController } from './accesses.controller';
import { AccessesService } from './accesses.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  controllers: [AccessesController, InviteAcceptController],
  providers: [AccessesService],
})
export class AccessesModule {}
