import { IsOptional, IsString, MinLength } from 'class-validator';
import { WebsterProjectManifest } from '@webster/shared';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  projectName: string;

  @IsOptional()
  manifest?: WebsterProjectManifest;
}
