import { Module } from '@nestjs/common';
import { AccessesController } from './accesses.controller';
import { AccessesService } from './accesses.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  controllers: [AccessesController],
  providers: [AccessesService],
})
export class AccessesModule {}
