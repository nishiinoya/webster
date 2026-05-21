import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { StorageModule } from '../storage/storage.module';
import { ProjectsModule } from '../projects/projects.module';

/**
 * AssetsModule handles binary asset upload/download for shared projects.
 *
 * BUG 6 fix: import ProjectsModule so ProjectAccessService is available for
 * injection, enabling access enforcement in AssetsService.
 */
@Module({
  imports: [StorageModule, ProjectsModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
