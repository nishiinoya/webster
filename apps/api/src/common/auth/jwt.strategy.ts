import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
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
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.email_verified === false) {
      throw new UnauthorizedException('Email not verified');
    }

    const auth0Subject = payload.sub;
    const email = payload.email ?? '';
    const displayName = payload.name ?? null;

    // Find-or-create user, sync email and display_name
    const user = await this.prisma.user.upsert({
      where: { auth0Subject },
      create: {
        auth0Subject,
        email,
        displayName,
      },
      update: {
        email,
        displayName,
      },
    });

    return {
      id: user.id,
      auth0Subject: user.auth0Subject,
      email: user.email,
      displayName: user.displayName,
    };
  }
}
