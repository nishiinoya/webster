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

  /** Singleton JWKS client — reusing it keeps the key cache warm across connections. */
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

      // Fast path for known subjects — one lookup, no /userinfo, no merge tx.
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
        return;
      }

      // New subject: resolve a real email (via /userinfo if needed) and reconcile.
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

        // Merge pending-invite row into the real subject row.
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
            where: { userId: byEmail.id },
            data: { userId: bySubject.id },
          });
          await tx.projectComment.updateMany({
            where: { resolvedBy: byEmail.id },
            data: { resolvedBy: bySubject.id },
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

    // Register presence BEFORE building the state payload so the joining
    // client's own entry is included in the users list they receive.
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

    // Notify everyone else that a new user joined.
    socket.to(`project:${projectId}`).emit('presence:update', allUsers);
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
    // Clean up once this is the last pending commit so the map doesn't grow forever.
    void next.then(() => {
      if (this.projectLocks.get(projectId) === next) {
        this.projectLocks.delete(projectId);
      }
    });
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

    // Auto-rebase: if another commit was applied ahead of this one in the queue
    // (baseVersion is stale), re-apply the op on top of the current state
    // instead of rejecting it. Operations are already serialized per-project by
    // projectLocks, so the only cause of a mismatch is a concurrent user — and
    // for a drawing editor where ops are independent patches, last-write-wins
    // applied in queue order is the correct behaviour.
    if (op.baseVersion !== project.currentVersion) {
      if (!op.scenePatch?.length && !op.scene) {
        // No payload to apply — nothing we can do, ask client to resync.
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
    const newManifest = this.operationApplier.apply(currentManifest, op);
    const newVersion = project.currentVersion + 1;

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        metadata: newManifest as any,
        currentVersion: newVersion,
      },
    });

    // When rebased, remote clients can't safely apply a stale patch (it was
    // computed against an older base). Send the full scene instead so every
    // client does a safe scene-replace regardless of their local version.
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

    // Exclude the sender — they already know where their own cursor is.
    socket
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
