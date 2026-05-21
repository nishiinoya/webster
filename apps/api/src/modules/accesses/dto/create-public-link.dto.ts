import {
  IsEnum,
  IsISO8601,
  IsOptional,
} from 'class-validator';

export class CreatePublicLinkDto {
  @IsEnum(['viewer', 'editor', 'commenter'])
  permission: 'viewer' | 'editor' | 'commenter';

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
