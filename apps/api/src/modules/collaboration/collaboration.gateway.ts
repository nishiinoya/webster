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

/** Augment socket.data with our resolved user and tracked presence entries. */
declare module 'socket.io' {
  interface SocketData {
    user: AuthUser;
    /** clientId → projectId entries so we can clean up on disconnect */
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
})
export class CollaborationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(CollaborationGateway.name);

  /** Per-project mutex: Map<projectId, tail of promise chain> */
  private readonly projectLocks = new Map<string, Promise<void>>();

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
      const email = payload.email ?? '';
      const displayName = payload.name ?? null;

      const dbUser = await this.prisma.user.upsert({
        where: { auth0Subject },
        create: { auth0Subject, email, displayName },
        update: { email, displayName },
      });

      socket.data.user = {
        id: dbUser.id,
        auth0Subject: dbUser.auth0Subject,
        email: dbUser.email,
        displayName: dbUser.displayName,
      };
      socket.data.trackedPresence = new Map();

      this.logger.debug(`Socket ${socket.id} authenticated as ${dbUser.email}`);
    } catch (err) {
      this.logger.warn(`Socket ${socket.id} auth failed: ${(err as Error).message}`);
      socket.disconnect(true);
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

  // ---------------------------------------------------------------------------
  // project:join
  // ---------------------------------------------------------------------------
  @SubscribeMessage('project:join')
  async onProjectJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { clientId: string; projectId: string },
  ) {
    const user: AuthUser = socket.data.user;
    const { clientId, projectId } = data ?? {};

    if (!user || !projectId || !clientId) return;

    // Access check
    if (this.projectAccessService) {
      const role = await this.projectAccessService.resolveRole(projectId, user.id);
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

    // Load project state
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
            await this.projectAccessService.resolveRole(projectId, user.id),
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

    const statePayload: SharedProjectStatePayload = {
      projectId,
      projectName: project.projectName,
      currentVersion: project.currentVersion,
      role: frontendRole,
      snapshot: (project.metadata ?? {}) as any,
      assets,
      snapshots,
      users: this.presenceService.getAll(projectId),
    };

    socket.emit('project:state', statePayload);

    // Update presence
    const presence: SharedProjectPresence = {
      user: {
        id: user.id,
        displayName: user.displayName ?? user.email,
        role: frontendRole,
      },
    };
    this.presenceService.set(projectId, clientId, presence);
    socket.data.trackedPresence.set(clientId, projectId);

    socket.to(`project:${projectId}`).emit(
      'presence:update',
      this.presenceService.getAll(projectId),
    );
  }

  // ---------------------------------------------------------------------------
  // project:leave
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // operation:preview
  // ---------------------------------------------------------------------------
  @SubscribeMessage('operation:preview')
  onOperationPreview(
    @ConnectedSocket() socket: Socket,
    @MessageBody() op: ProjectOperation,
  ) {
    if (!op?.projectId) return;
    socket.to(`project:${op.projectId}`).emit('operation:preview', op);
  }

  // ---------------------------------------------------------------------------
  // operation:commit
  // ---------------------------------------------------------------------------
  @SubscribeMessage('operation:commit')
  async onOperationCommit(
    @ConnectedSocket() socket: Socket,
    @MessageBody() op: ProjectOperation,
  ) {
    if (!op?.projectId) return;
    const { projectId } = op;

    // Serialise commits per project
    const tail = this.projectLocks.get(projectId) ?? Promise.resolve();
    const next = tail.then(() => this.doCommit(socket, op)).catch(() => {});
    this.projectLocks.set(projectId, next);
    await next;
  }

  private async doCommit(socket: Socket, op: ProjectOperation): Promise<void> {
    const { projectId } = op;

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
      socket.emit('project:error', {
        code: 'version_conflict',
        message: `Version conflict: expected ${project.currentVersion}, got ${op.baseVersion}.`,
        projectId,
      });
      return;
    }

    const currentManifest = (project.metadata ?? {}) as any;
    const newManifest = this.operationApplier.apply(currentManifest, op);
    const newVersion = project.currentVersion + 1;

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        metadata: newManifest as any,
        currentVersion: newVersion,
      },
    });

    const applied: AppliedProjectOperation = {
      projectId,
      version: newVersion,
      operation: { ...op, phase: 'commit' },
    };

    this.server.to(`project:${projectId}`).emit('operation:applied', applied);
  }

  // ---------------------------------------------------------------------------
  // presence:cursor
  // ---------------------------------------------------------------------------
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

    this.server
      .to(`project:${projectId}`)
      .emit('presence:update', this.presenceService.getAll(projectId));
  }

  // ---------------------------------------------------------------------------
  // JWT verification helper (wraps jwks-rsa JwksClient into a Promise)
  // ---------------------------------------------------------------------------
  private verifyJwt(
    token: string,
    domain: string,
    audience: string,
  ): Promise<JwtPayload> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const jwksRsa = require('jwks-rsa') as typeof import('jwks-rsa');
      const client = jwksRsa({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      });

      const getKey: GetPublicKeyOrSecret = (header, callback) => {
        client.getSigningKey(header.kid, (err, key) => {
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
