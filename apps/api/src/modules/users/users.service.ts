import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
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
  constructor(
    private readonly prisma: PrismaService,
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
}
