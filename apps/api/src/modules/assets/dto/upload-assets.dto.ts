import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class AssetMetadataItemDto {
  @IsOptional()
  @IsString()
  assetId?: string;

  @IsString()
  assetPath!: string;

  @IsString()
  fileField!: string;

  @IsString()
  mimeType!: string;
}

export class UploadAssetsMetadataDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssetMetadataItemDto)
  assets!: AssetMetadataItemDto[];
}
