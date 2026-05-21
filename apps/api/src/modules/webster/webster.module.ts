import { Module } from '@nestjs/common';
import { WebsterPackageService } from './webster-package.service';

@Module({
  providers: [WebsterPackageService],
  exports: [WebsterPackageService],
})
export class WebsterModule {}
