import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../types/auth-user';

interface JwtPayload {
  sub: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
  [key: string]: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly domain: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const domain = config.get<string>('auth0.domain')!;
    const audience = config.get<string>('auth0.audience')!;

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience,
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
      passReqToCallback: true,
    });

    this.domain = domain;
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthUser> {
    if (payload.email_verified === false) {
      throw new UnauthorizedException('Email not verified');
    }

    const auth0Subject = payload.sub;

    const known = await this.prisma.user.findUnique({ where: { auth0Subject } });
    if (known) {
      const claimEmail = (payload.email ?? '').trim().toLowerCase();
      if (claimEmail && known.email.startsWith('noemail:')) {
        try {
          const updated = await this.prisma.user.update({
            where: { id: known.id },
            data: { email: claimEmail, displayName: payload.name ?? known.displayName },
          });
          return this.toAuthUser(updated);
        } catch {
        }
      }
      return this.toAuthUser(known);
    }

    let realEmail = (payload.email ?? '').trim().toLowerCase();
    let displayName = payload.name ?? null;
    if (!realEmail) {
      const userInfo = await this.fetchUserInfo(req);
      if (userInfo) {
        realEmail = (userInfo.email ?? '').trim().toLowerCase();
        displayName = displayName ?? userInfo.name ?? null;
      }
    }

    const placeholderEmail = `noemail:${auth0Subject}`;
    const emailForRow = realEmail || placeholderEmail;

    const user = await this.prisma.$transaction(async (tx) => {
      const bySubject = await tx.user.findUnique({ where: { auth0Subject } });
      const byEmail = realEmail
        ? await tx.user.findUnique({ where: { email: realEmail } })
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

    return this.toAuthUser(user);
  }

  private toAuthUser(user: {
    id: string;
    auth0Subject: string;
    email: string;
    displayName: string | null;
  }): AuthUser {
    return {
      id: user.id,
      auth0Subject: user.auth0Subject,
      email: user.email,
      displayName: user.displayName,
    };
  }

  private async fetchUserInfo(
    req: Request,
  ): Promise<{ email?: string; name?: string } | null> {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return null;

    try {
      const response = await fetch(`https://${this.domain}/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) {
        this.logger.warn(`Auth0 /userinfo returned ${response.status}`);
        return null;
      }
      return (await response.json()) as { email?: string; name?: string };
    } catch (err) {
      this.logger.warn(`Auth0 /userinfo failed: ${(err as Error).message}`);
      return null;
    }
  }
}
