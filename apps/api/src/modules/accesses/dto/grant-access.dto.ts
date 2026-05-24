import {
  IsEmail,
  IsISO8601,
  IsIn,
  IsOptional,
} from 'class-validator';

export class GrantAccessDto {
  @IsEmail()
  email: string;

  @IsIn(['viewer', 'editor', 'commenter'])
  permission: 'viewer' | 'editor' | 'commenter';

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
