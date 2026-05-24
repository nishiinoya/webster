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
  @IsString()
  layerId?: string;

  @IsOptional()
  @IsNumber()
  localX?: number;

  @IsOptional()
  @IsNumber()
  localY?: number;

  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
}
