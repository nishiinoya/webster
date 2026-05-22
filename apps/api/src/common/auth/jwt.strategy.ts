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

    // FAST PATH: a subject we've already seen is the overwhelmingly common case.
    // Resolve it with a single lookup — no /userinfo call, no merge transaction.
    // (Calling /userinfo + a multi-table merge on EVERY request was both slow and
    // a source of lock contention/hangs under concurrent REST + WS auth.)
    const known = await this.prisma.user.findUnique({ where: { auth0Subject } });
    if (known) {
      // Cheap backfill: if the JWT carries a real email and our stored one is a
      // placeholder, update it once. No /userinfo, no merge.
      const claimEmail = (payload.email ?? '').trim().toLowerCase();
      if (claimEmail && known.email.startsWith('noemail:')) {
        try {
          const updated = await this.prisma.user.update({
            where: { id: known.id },
            data: { email: claimEmail, displayName: payload.name ?? known.displayName },
          });
          return this.toAuthUser(updated);
        } catch {
          // email may now collide with a pending row — ignore and use what we have
        }
      }
      return this.toAuthUser(known);
    }

    // SLOW PATH (new subject only): resolve a real email so we can attach to a
    // pending invite, falling back to /userinfo when the token lacks the claim.
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
