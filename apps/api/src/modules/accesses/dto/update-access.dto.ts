import {
  IsISO8601,
  IsIn,
  IsOptional,
} from 'class-validator';

export class UpdateAccessDto {
  @IsOptional()
  @IsIn(['viewer', 'editor', 'commenter'])
  permission?: 'viewer' | 'editor' | 'commenter';

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
