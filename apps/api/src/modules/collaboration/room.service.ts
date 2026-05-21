import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  AppliedProjectOperation,
  ServerToClientCollaborationEvent,
  SharedProjectPresence,
  SharedProjectStatePayload,
  WebsterProjectManifest,
} from '@webster/shared';
import { AuthUser } from '../../common/types/auth-user';
import { PresenceService } from './presence.service';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private server: Server | null = null;

  constructor(private readonly presenceService: PresenceService) {}

  /** Called by the gateway after init to register the Socket.IO server instance. */
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

  /**
   * Used by the Snapshots module to notify connected clients after a restore.
   * Emits a scene:replace operation:applied AND project:state so clients re-hydrate.
   */
  async notifyProjectReplaced(
    projectId: string,
    newManifest: WebsterProjectManifest,
    newVersion: number,
    byUser: AuthUser,
  ): Promise<void> {
    if (!this.server) return;

    const room = `project:${projectId}`;

    const appliedOp: AppliedProjectOperation = {
      projectId,
      version: newVersion,
      operation: {
        projectId,
        clientId: byUser.id,
        clientOperationId: '',
        createdAt: new Date().toISOString(),
        kind: 'scene:replace',
        phase: 'commit',
        baseVersion: newVersion - 1,
        payload: { source: 'restore' },
        scene: newManifest,
      },
    };

    this.server.to(room).emit('operation:applied', appliedOp);

    const statePayload: SharedProjectStatePayload = {
      projectId,
      currentVersion: newVersion,
      role: 'owner', // clients will use their own cached role; this is a re-hydration hint
      snapshot: newManifest,
      users: this.presenceService.getAll(projectId),
    };

    this.server.to(room).emit('project:state', statePayload);

    this.logger.log(`notifyProjectReplaced: project ${projectId} → version ${newVersion}`);
  }
}
