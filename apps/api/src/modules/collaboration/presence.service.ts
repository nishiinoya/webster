import { Injectable } from '@nestjs/common';
import { SharedProjectPresence } from '@webster/shared';

@Injectable()
export class PresenceService {
  private readonly rooms = new Map<string, Map<string, SharedProjectPresence>>();

  private getRoom(projectId: string): Map<string, SharedProjectPresence> {
    if (!this.rooms.has(projectId)) {
      this.rooms.set(projectId, new Map());
    }
    return this.rooms.get(projectId)!;
  }

  set(projectId: string, clientId: string, presence: SharedProjectPresence): void {
    this.getRoom(projectId).set(clientId, presence);
  }

  remove(projectId: string, clientId: string): void {
    this.getRoom(projectId).delete(clientId);
  }

  getAll(projectId: string): SharedProjectPresence[] {
    return [...this.getRoom(projectId).values()];
  }

  /** Remove ALL presence entries for a given socket's clients. */
  clearBySocket(socketClientIds: { projectId: string; clientId: string }[]): void {
    for (const { projectId, clientId } of socketClientIds) {
      this.remove(projectId, clientId);
    }
  }
}
