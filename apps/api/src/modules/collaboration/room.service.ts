import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  AppliedProjectOperation,
  ServerToClientCollaborationEvent,
  SharedProjectAssetReference,
  SharedProjectPresence,
  WebsterProjectManifest,
} from '@webster/shared';
import { AuthUser } from '../../common/types/auth-user';
import { PresenceService } from './presence.service';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private server: Server | null = null;

  constructor(private readonly presenceService: PresenceService) {}

  setServer(server: Server): void {
    this.server = server;
  }

  broadcastToRoom(projectId: string, event: ServerToClientCollaborationEvent): void {
    if (!this.server) return;
    this.server.to(`project:${projectId}`).emit(event.type, event.payload);
  }

  getPresence(projectId: string): SharedProjectPresence[] {
    return this.presenceService.getAll(projectId);
  }

  async notifyProjectReplaced(
    projectId: string,
    newManifest: WebsterProjectManifest,
    newVersion: number,
    byUser: AuthUser,
    options: {
      assetReferences?: SharedProjectAssetReference[];
      clientId?: string;
      operationId?: string;
      source?: string;
    } = {},
  ): Promise<void> {
    if (!this.server) return;

    const room = `project:${projectId}`;
    const appliedOp: AppliedProjectOperation = {
      projectId,
      version: newVersion,
      operation: {
        assetReferences: options.assetReferences,
        baseVersion: newVersion - 1,
        clientId: options.clientId ?? byUser.id,
        clientOperationId: options.operationId ?? `server-${Date.now()}`,
        createdAt: new Date().toISOString(),
        kind: 'scene:replace',
        label: options.source === 'cloud-save' ? 'Cloud save' : 'Project update',
        payload: { source: options.source ?? 'server-replace' },
        phase: 'commit',
        projectId,
        scene: newManifest,
      },
    };

    this.server.to(room).emit('operation:applied', appliedOp);
    this.logger.log(`notifyProjectReplaced: project ${projectId} -> version ${newVersion}`);
  }
}
