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
    let realEmail = (payload.email ?? '').trim().toLowerCase();
    let displayName = payload.name ?? null;

    // Google OAuth (and some other social connections) issue Auth0 access tokens
    // without the email claim. If we don't have one and we don't already know
    // this user's email, fetch it from /userinfo so pending-invite reconciliation
    // can find them.
    if (!realEmail) {
      const existing = await this.prisma.user.findUnique({
        where: { auth0Subject },
        select: { email: true, displayName: true },
      });

      if (existing && !existing.email.startsWith('noemail:')) {
        realEmail = existing.email;
        displayName = displayName ?? existing.displayName;
      } else {
        const userInfo = await this.fetchUserInfo(req);
        if (userInfo) {
          realEmail = (userInfo.email ?? '').trim().toLowerCase();
          displayName = displayName ?? userInfo.name ?? null;
        }
      }
    }

    const placeholderEmail = `noemail:${auth0Subject}`;
    const emailForRow = realEmail || placeholderEmail;

    // ------------------------------------------------------------------
    // Reconciliation — coalesce subject-row and pending-email-row if both exist.
    // ------------------------------------------------------------------
    const user = await this.prisma.$transaction(async (tx) => {
      const bySubject = await tx.user.findUnique({ where: { auth0Subject } });
      const byEmail = realEmail
        ? await tx.user.findUnique({ where: { email: realEmail } })
        : null;

      // Both rows exist and they're different — merge the pending into the
      // real one. Re-point every project_access then delete the pending row.
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

      // Only pending row exists — attach our subject to it.
      if (!bySubject && byEmail) {
        return tx.user.update({
          where: { id: byEmail.id },
          data: { auth0Subject, displayName: displayName ?? byEmail.displayName },
        });
      }

      // Only subject row exists — refresh email/name if changed.
      if (bySubject) {
        if (bySubject.email !== emailForRow || bySubject.displayName !== displayName) {
          return tx.user.update({
            where: { id: bySubject.id },
            data: { email: emailForRow, displayName: displayName ?? bySubject.displayName },
          });
        }
        return bySubject;
      }

      // New user.
      return tx.user.create({
        data: { auth0Subject, email: emailForRow, displayName },
      });
    });

    return {
      id: user.id,
      auth0Subject: user.auth0Subject,
      email: user.email,
      displayName: user.displayName,
    };
  }

  /** Fetch the user's email from Auth0 /userinfo using the access token. */
  private async fetchUserInfo(
    req: Request,
  ): Promise<{ email?: string; name?: string } | null> {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return null;

    try {
      const response = await fetch(`https://${this.domain}/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
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
