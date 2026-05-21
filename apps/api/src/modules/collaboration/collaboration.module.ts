import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ProjectsModule } from '../projects/projects.module';
import { CollaborationGateway } from './collaboration.gateway';
import { RoomService } from './room.service';
import { PresenceService } from './presence.service';
import { OperationApplierService } from './operation-applier.service';

@Module({
  imports: [PrismaModule, ProjectsModule],
  providers: [
    CollaborationGateway,
    RoomService,
    PresenceService,
    OperationApplierService,
  ],
  exports: [RoomService],
})
export class CollaborationModule {}
