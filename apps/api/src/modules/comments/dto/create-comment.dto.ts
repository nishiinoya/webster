import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;

  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
}
