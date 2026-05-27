import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { StorageModule } from '../storage/storage.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [StorageModule, ProjectsModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
