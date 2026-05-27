import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { verify, JwtPayload as BaseJwtPayload, GetPublicKeyOrSecret } from 'jsonwebtoken';
import {
  AppliedProjectOperation,
  ProjectOperation,
  SharedProjectPresence,
  SharedProjectStatePayload,
} from '@webster/shared';
import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { PresenceService } from './presence.service';
import { RoomService } from './room.service';
import { OperationApplierService } from './operation-applier.service';
import { AuthUser } from '../../common/types/auth-user';

interface JwtPayload extends BaseJwtPayload {
  sub: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
}

declare module 'socket.io' {
  interface SocketData {
    user: AuthUser;
    trackedPresence: Map<string, string>;
  }
}

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim()),
    credentials: true,
  },
  maxHttpBufferSize: 16 * 1024 * 1024,
})
export class CollaborationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(CollaborationGateway.name);

  private readonly projectLocks = new Map<string, Promise<void>>();

  private jwksClient: import('jwks-rsa').JwksClient | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly projectAccessService: ProjectAccessService | null,
    private readonly presenceService: PresenceService,
    private readonly roomService: RoomService,
    private readonly operationApplier: OperationApplierService,
  ) {}

  afterInit(server: Server) {
    this.roomService.setServer(server);
    this.logger.log('CollaborationGateway initialised');
  }

  async handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth as Record<string, string>)?.token ??
        (socket.handshake.query?.token as string | undefined);

      if (!token) {
        throw new Error('No token');
      }

      const domain = this.config.get<string>('auth0.domain')!;
      const audience = this.config.get<string>('auth0.audience')!;

      const payload = await this.verifyJwt(token, domain, audience);

      if (payload.email_verified === false) {
        throw new Error('Email not verified');
      }

      const auth0Subject = payload.sub!;

      const knownUser = await this.prisma.user.findUnique({
        where: { auth0Subject },
      });
      if (knownUser) {
        socket.data.user = {
          id: knownUser.id,
          auth0Subject: knownUser.auth0Subject,
          email: knownUser.email,
          displayName: knownUser.displayName,
        };
        socket.data.trackedPresence = new Map();
        this.logger.debug(`Socket ${socket.id} authenticated as ${knownUser.email}`);
        socket.emit('connection:ready');
        return;
      }

      let rawEmail = (payload.email ?? '').trim().toLowerCase();
      let displayName: string | null = payload.name ?? null;
      if (!rawEmail) {
        const userInfo = await this.fetchUserInfo(token, domain);
        if (userInfo) {
          rawEmail = (userInfo.email ?? '').trim().toLowerCase();
          displayName = displayName ?? userInfo.name ?? null;
        }
      }

      const emailForRow = rawEmail || `noemail:${auth0Subject}`;

      const dbUser = await this.prisma.$transaction(async (tx) => {
        const bySubject = await tx.user.findUnique({ where: { auth0Subject } });
        const byEmail = rawEmail
          ? await tx.user.findUnique({ where: { email: rawEmail } })
          : null;

        if (bySubject && byEmail && bySubject.id !== byEmail.id) {
          await tx.projectAccess.updateMany({
            where: { sharedWithUserId: byEmail.id },
            data: { sharedWithUserId: bySubject.id },
          });
          await tx.projectAccess.updateMany({
            where: { createdBy: byEmail.id },
            data: { createdBy: bySubject.id },
          });
          await tx.projectComment.updateMany({
            where: { authorUserId: byEmail.id },
            data: { authorUserId: bySubject.id },
          });
          await tx.projectComment.updateMany({
            where: { resolvedByUserId: byEmail.id },
            data: { resolvedByUserId: bySubject.id },
          });
          await tx.projectInvite.updateMany({
            where: { invitedByUserId: byEmail.id },
            data: { invitedByUserId: bySubject.id },
          });
          await tx.projectInvite.updateMany({
            where: { acceptedByUserId: byEmail.id },
            data: { acceptedByUserId: bySubject.id },
          });
          await tx.projectSnapshot.updateMany({
            where: { createdBy: byEmail.id },
            data: { createdBy: bySubject.id },
          });
          await tx.project.updateMany({
            where: { ownerId: byEmail.id },
            data: { ownerId: bySubject.id },
          });
          await tx.user.delete({ where: { id: byEmail.id } });
          return tx.user.update({
            where: { id: bySubject.id },
            data: { email: emailForRow, displayName: displayName ?? bySubject.displayName },
          });
        }

        if (!bySubject && byEmail) {
          return tx.user.update({
            where: { id: byEmail.id },
            data: { auth0Subject, displayName: displayName ?? byEmail.displayName },
          });
        }

        if (bySubject) {
          if (bySubject.email !== emailForRow || bySubject.displayName !== displayName) {
            return tx.user.update({
              where: { id: bySubject.id },
              data: { email: emailForRow, displayName: displayName ?? bySubject.displayName },
            });
          }
          return bySubject;
        }

        return tx.user.create({
          data: { auth0Subject, email: emailForRow, displayName },
        });
      });

      socket.data.user = {
        id: dbUser.id,
        auth0Subject: dbUser.auth0Subject,
        email: dbUser.email,
        displayName: dbUser.displayName,
      };
      socket.data.trackedPresence = new Map();

      this.logger.debug(`Socket ${socket.id} authenticated as ${dbUser.email}`);
      socket.emit('connection:ready');
    } catch (err) {
      this.logger.warn(`Socket ${socket.id} auth failed: ${(err as Error).message}`);
      socket.disconnect(true);
    }
  }

  private async fetchUserInfo(
    token: string,
    domain: string,
  ): Promise<{ email?: string; name?: string } | null> {
    try {
      const response = await fetch(`https://${domain}/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) return null;
      return (await response.json()) as { email?: string; name?: string };
    } catch {
      return null;
    }
  }

  handleDisconnect(socket: Socket) {
    const tracked = socket.data.trackedPresence;
    if (!tracked) return;

    for (const [clientId, projectId] of tracked.entries()) {
      this.presenceService.remove(projectId, clientId);
      this.server
        .to(`project:${projectId}`)
        .emit('presence:update', this.presenceService.getAll(projectId));
    }
  }

  @SubscribeMessage('project:join')
  async onProjectJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { clientId: string; projectId: string },
  ) {
    const user: AuthUser = socket.data.user;
    const { clientId, projectId } = data ?? {};

    if (!user || !projectId || !clientId) return;

    if (this.projectAccessService) {
      const role = await this.projectAccessService.resolveOrGrantLinkRole(projectId, user.id);
      if (!role) {
        socket.emit('project:error', {
          code: 'forbidden',
          message: 'Project not found or access denied.',
          projectId,
        });
        return;
      }
    }

    await socket.join(`project:${projectId}`);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
    });

    if (!project) {
      socket.emit('project:error', {
        code: 'not_found',
        message: 'Project not found.',
        projectId,
      });
      return;
    }

    const frontendRole =
      this.projectAccessService
        ? this.projectAccessService.toFrontendRole(
            await this.projectAccessService.resolveOrGrantLinkRole(projectId, user.id),
          )
        : 'viewer';

    const assetsPrefix = `projects/${projectId}/assets/`;
    const dbAssets = await this.prisma.projectAsset.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    const assets = dbAssets.map((a) => {
      const assetPath = a.storageKey.startsWith(assetsPrefix)
        ? a.storageKey.slice(assetsPrefix.length)
        : a.storageKey;
      const encodedPath = assetPath.split('/').map(encodeURIComponent).join('/');

      return {
        assetId: a.id,
        assetPath,
        downloadUrl: `/shared-projects/${encodeURIComponent(projectId)}/assets/${encodedPath}`,
        mimeType: a.mimeType ?? undefined,
      };
    });

    const snapshotRows = await this.prisma.projectSnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { creator: { select: { displayName: true, email: true } } },
    });
    const snapshots = snapshotRows.map((s) => ({
      id: s.id,
      version: (s.stateData as Record<string, unknown> | null)?.version as number ?? 0,
      message: s.snapshotName ?? null,
      authorName: s.creator.displayName ?? s.creator.email ?? null,
      createdAt: s.createdAt.toISOString(),
      type: 'manual' as const,
    }));

    const presence: SharedProjectPresence = {
      user: {
        id: user.id,
        displayName: user.displayName ?? user.email,
        role: frontendRole,
      },
    };
    this.presenceService.set(projectId, clientId, presence);
    socket.data.trackedPresence.set(clientId, projectId);

    const allUsers = this.presenceService.getAll(projectId);

    const statePayload: SharedProjectStatePayload = {
      projectId,
      projectName: project.projectName,
      currentVersion: project.currentVersion,
      role: frontendRole,
      snapshot: (project.metadata ?? {}) as any,
      assets,
      snapshots,
      users: allUsers,
    };

    socket.emit('project:state', statePayload);

    socket.to(`project:${projectId}`).emit('presence:update', allUsers);
  }

  @SubscribeMessage('project:leave')
  async onProjectLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { clientId: string; projectId: string },
  ) {
    const { clientId, projectId } = data ?? {};
    if (!projectId || !clientId) return;

    await socket.leave(`project:${projectId}`);
    this.presenceService.remove(projectId, clientId);
    socket.data.trackedPresence?.delete(clientId);

    socket
      .to(`project:${projectId}`)
      .emit('presence:update', this.presenceService.getAll(projectId));
  }

  @SubscribeMessage('operation:preview')
  async onOperationPreview(
    @ConnectedSocket() socket: Socket,
    @MessageBody() op: ProjectOperation,
  ) {
    if (!op?.projectId) return;
    if (!(await this.canEditProject(socket, op.projectId))) return;
    socket.to(`project:${op.projectId}`).emit('operation:preview', op);
  }

  @SubscribeMessage('operation:commit')
  async onOperationCommit(
    @ConnectedSocket() socket: Socket,
    @MessageBody() op: ProjectOperation,
  ) {
    if (!op?.projectId) return;
    const { projectId } = op;

    const tail = this.projectLocks.get(projectId) ?? Promise.resolve();
    const next = tail.then(() => this.doCommit(socket, op)).catch(() => {});
    this.projectLocks.set(projectId, next);
    void next.then(() => {
      if (this.projectLocks.get(projectId) === next) {
        this.projectLocks.delete(projectId);
      }
    });
    await next;
  }

  private async doCommit(socket: Socket, op: ProjectOperation): Promise<void> {
    const { projectId } = op;

    if (!(await this.canEditProject(socket, projectId))) {
      return;
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { id: true, currentVersion: true, metadata: true },
    });

    if (!project) {
      socket.emit('project:error', {
        code: 'not_found',
        message: 'Project not found.',
        projectId,
      });
      return;
    }

    if (op.baseVersion !== project.currentVersion) {
      if (!op.scenePatch?.length) {
        socket.emit('project:error', {
          code: 'version_conflict',
          message: `Version conflict: server is at v${project.currentVersion}, op based on v${op.baseVersion}. Please resync.`,
          projectId,
        });
        return;
      }
      this.logger.debug(
        `Auto-rebasing op ${op.clientOperationId} from v${op.baseVersion} onto v${project.currentVersion} for project ${projectId}`,
      );
    }

    const wasRebased = op.baseVersion !== project.currentVersion;
    const currentManifest = (project.metadata ?? {}) as any;
    let newManifest: any;
    try {
      newManifest = this.operationApplier.apply(currentManifest, op, {
        allowSceneFallback: !wasRebased,
      });
    } catch {
      socket.emit('project:error', {
        code: 'version_conflict',
        message: `Version conflict: server is at v${project.currentVersion}, op based on v${op.baseVersion}. Please resync.`,
        projectId,
      });
      return;
    }
    const newVersion = project.currentVersion + 1;

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        metadata: newManifest as any,
        currentVersion: newVersion,
      },
    });

    const broadcastOp = wasRebased
      ? { ...op, phase: 'commit' as const, scene: newManifest, scenePatch: undefined }
      : { ...op, phase: 'commit' as const };

    const applied: AppliedProjectOperation = {
      projectId,
      version: newVersion,
      operation: broadcastOp,
    };

    this.server.to(`project:${projectId}`).emit('operation:applied', applied);
  }

  private async canEditProject(socket: Socket, projectId: string): Promise<boolean> {
    const user: AuthUser | undefined = socket.data.user;

    if (!user) {
      socket.emit('project:error', {
        code: 'forbidden',
        message: 'Authentication required.',
        projectId,
      });
      return false;
    }

    if (!this.projectAccessService) {
      socket.emit('project:error', {
        code: 'forbidden',
        message: 'Project access service is unavailable.',
        projectId,
      });
      return false;
    }

    const role = await this.projectAccessService.resolveOrGrantLinkRole(projectId, user.id);

    if (!role) {
      socket.emit('project:error', {
        code: 'not_found',
        message: 'Project not found or access denied.',
        projectId,
      });
      return false;
    }

    const roleRank: Record<string, number> = {
      commenter: 1,
      editor: 2,
      owner: 3,
      viewer: 1,
    };

    if ((roleRank[role] ?? 0) < roleRank.editor) {
      socket.emit('project:error', {
        code: 'forbidden',
        message: 'Editor access is required to change this project.',
        projectId,
      });
      return false;
    }

    return true;
  }

  @SubscribeMessage('presence:cursor')
  onPresenceCursor(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: {
      clientId: string;
      cursor: { x: number; y: number } | null;
      projectId: string;
      tool?: string | null;
    },
  ) {
    const user: AuthUser = socket.data.user;
    const { clientId, cursor, projectId, tool } = data ?? {};
    if (!user || !projectId || !clientId) return;

    const existing = this.presenceService.getAll(projectId).find(
      (p) => p.user.id === user.id,
    );

    const presence: SharedProjectPresence = {
      cursor: cursor ?? null,
      tool: tool ?? null,
      user: existing?.user ?? {
        id: user.id,
        displayName: user.displayName ?? user.email,
      },
    };

    this.presenceService.set(projectId, clientId, presence);

    socket
      .to(`project:${projectId}`)
      .emit('presence:update', this.presenceService.getAll(projectId));
  }

  private verifyJwt(
    token: string,
    domain: string,
    audience: string,
  ): Promise<JwtPayload> {
    return new Promise((resolve, reject) => {
      if (!this.jwksClient) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const jwksRsa = require('jwks-rsa') as typeof import('jwks-rsa');
        this.jwksClient = jwksRsa({
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 5,
          jwksUri: `https://${domain}/.well-known/jwks.json`,
        });
      }

      const getKey: GetPublicKeyOrSecret = (header, callback) => {
        this.jwksClient!.getSigningKey(header.kid, (err, key) => {
          if (err || !key) {
            callback(err ?? new Error('Signing key not found'));
            return;
          }
          const signingKey =
            'publicKey' in key ? key.publicKey : (key as any).rsaPublicKey;
          callback(null, signingKey);
        });
      };

      verify(
        token,
        getKey,
        {
          audience,
          issuer: `https://${domain}/`,
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err || !decoded) {
            reject(err ?? new Error('Token decode failed'));
          } else {
            resolve(decoded as JwtPayload);
          }
        },
      );
    });
  }
}
