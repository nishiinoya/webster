import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { StorageModule } from '../storage/storage.module';

/**
 * AssetsModule handles binary asset upload/download for shared projects.
 *
 * StorageService is imported from StorageModule.
 * ProjectAccessService is injected @Optional() — it will be provided once
 * ProjectsModule is fully implemented and exports it globally or is imported here.
 */
@Module({
  imports: [StorageModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
