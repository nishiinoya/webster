import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
} from 'class-validator';

export class GrantAccessDto {
  @IsEmail()
  email: string;

  @IsEnum(['viewer', 'editor', 'commenter'])
  permission: 'viewer' | 'editor' | 'commenter';

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
