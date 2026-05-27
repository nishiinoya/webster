import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify, type GetPublicKeyOrSecret } from 'jsonwebtoken';
import type { JwksClient } from 'jwks-rsa';
import { Readable } from 'stream';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../../common/types/auth-user';
import { UpdateUserDto } from './dto/update-user.dto';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const PROFILE_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  private jwksClient: JwksClient | null = null;
  private managementToken: { expiresAt: number; token: string } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly storage: StorageService | null,
  ) {}

  private avatarKey(userId: string): string {
    return `avatars/${userId}`;
  }

  async getMe(user: AuthUser): Promise<UserProfile> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: PROFILE_SELECT,
    });
    return row;
  }

  async updateMe(user: AuthUser, dto: UpdateUserDto): Promise<UserProfile> {
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
      },
      select: PROFILE_SELECT,
    });
  }

  async uploadAvatar(
    user: AuthUser,
    file: Express.Multer.File | undefined,
  ): Promise<UserProfile> {
    if (!this.storage) {
      throw new ServiceUnavailableException('Storage is not available');
    }
    if (!file) {
      throw new BadRequestException('No avatar file provided');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Avatar must be an image');
    }

    await this.storage.putObject(this.avatarKey(user.id), file.buffer, file.mimetype);

    // Store a short, cache-busted URL path — the binary lives in object storage.
    const avatarUrl = `/users/${user.id}/avatar?v=${Date.now()}`;

    return this.prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
      select: PROFILE_SELECT,
    });
  }

  async removeAvatar(user: AuthUser): Promise<UserProfile> {
    if (this.storage) {
      try {
        await this.storage.deleteObject(this.avatarKey(user.id));
      } catch {
        // already gone — non-fatal
      }
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
      select: PROFILE_SELECT,
    });
  }

  async streamAvatar(
    userId: string,
  ): Promise<{ body: Readable; mimeType: string; size: number }> {
    if (!this.storage) {
      throw new ServiceUnavailableException('Storage is not available');
    }

    // Pre-check the DB so we never call getObject for a key that doesn't
    // exist — a missing-key GetObject against MinIO hangs instead of failing
    // fast. If the row has no avatarUrl, there is no object to stream.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!user?.avatarUrl) {
      throw new NotFoundException('Avatar not found');
    }

    try {
      return await this.storage.getObject(this.avatarKey(userId));
    } catch {
      throw new NotFoundException('Avatar not found');
    }
  }

  async resendVerificationEmail(authorization: string | undefined) {
    const userId = await this.readAuth0SubjectFromAuthorization(authorization);
    const token = await this.getManagementToken();
    const domain = this.config.get<string>('auth0.domain')!;

    const response = await fetch(`https://${domain}/api/v2/jobs/verification-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        message || 'Unable to resend verification email',
      );
    }

    return { ok: true };
  }

  private async readAuth0SubjectFromAuthorization(authorization: string | undefined) {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null;

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    const payload = await this.verifyJwt(token);

    if (!payload.sub) {
      throw new UnauthorizedException('Invalid access token');
    }

    return payload.sub;
  }

  private async getManagementToken() {
    const cached = this.managementToken;
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token;
    }

    const domain = this.config.get<string>('auth0.domain')!;
    const clientId = this.config.get<string>('auth0.managementClientId')!;
    const clientSecret = this.config.get<string>('auth0.managementClientSecret')!;

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'Email resend is not configured. Set Auth0 management credentials.',
      );
    }

    const response = await fetch(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audience: `https://${domain}/api/v2/`,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Unable to contact Auth0');
    }

    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!body.access_token) {
      throw new ServiceUnavailableException('Auth0 did not return a token');
    }

    this.managementToken = {
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      token: body.access_token,
    };

    return body.access_token;
  }

  private verifyJwt(token: string): Promise<{ sub?: string }> {
    const domain = this.config.get<string>('auth0.domain')!;
    const audience = this.config.get<string>('auth0.audience')!;

    return new Promise((resolve, reject) => {
      const getKey: GetPublicKeyOrSecret = (header, callback) => {
        this.getJwksClient().getSigningKey(header.kid, (err, key) => {
          if (err || !key) {
            callback(err ?? new Error('Signing key not found'));
            return;
          }

          const signingKey =
            'publicKey' in key ? key.publicKey : (key as { rsaPublicKey: string }).rsaPublicKey;
          callback(null, signingKey);
        });
      };

      verify(
        token,
        getKey,
        {
          algorithms: ['RS256'],
          audience,
          issuer: `https://${domain}/`,
        },
        (err, decoded) => {
          if (err || !decoded) {
            reject(err ?? new Error('Token decode failed'));
            return;
          }

          resolve(decoded as { sub?: string });
        },
      );
    }).catch(() => {
      throw new UnauthorizedException('Invalid access token');
    });
  }

  private getJwksClient() {
    if (!this.jwksClient) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const jwksRsa = require('jwks-rsa') as typeof import('jwks-rsa');
      const domain = this.config.get<string>('auth0.domain')!;

      this.jwksClient = jwksRsa({
        cache: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
        rateLimit: true,
      });
    }

    return this.jwksClient;
  }
}
