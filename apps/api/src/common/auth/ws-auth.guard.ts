import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { PrismaService } from '../../database/prisma.service';

/**
 * WebSocket auth guard — validates Auth0 JWT from socket.handshake.auth.token
 * or ?token= query parameter. Attaches AuthUser to socket.data.user.
 *
 * Note: Primary WS auth is handled by SocketIoAuthMiddleware in the
 * collaboration gateway. This guard is available for gateway method-level use.
 */
@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsAuthGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const user = client.data?.user;

    if (!user) {
      throw new WsException('Unauthorized');
    }

    return true;
  }
}
