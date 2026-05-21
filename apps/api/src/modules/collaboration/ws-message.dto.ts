import { IsString, IsNotEmpty, IsOptional, IsNumber, IsObject } from 'class-validator';

export class JoinLeaveDto {
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  projectId!: string;
}

export class CursorDto {
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsOptional()
  cursor?: { x: number; y: number } | null;

  @IsOptional()
  @IsString()
  tool?: string | null;
}
