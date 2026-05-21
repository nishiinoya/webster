import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { UpdateUserDto } from './dto/update-user.dto';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(user: AuthUser): Promise<UserProfile> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async updateMe(user: AuthUser, dto: UpdateUserDto): Promise<UserProfile> {
    const row = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
