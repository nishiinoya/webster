import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsNumber()
  @IsOptional()
  PORT: number = 4000;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:3000';

  @IsString()
  @IsNotEmpty()
  AUTH0_DOMAIN: string;

  @IsString()
  @IsNotEmpty()
  AUTH0_AUDIENCE: string;

  @IsString()
  @IsOptional()
  AUTH0_MANAGEMENT_CLIENT_ID: string;

  @IsString()
  @IsOptional()
  AUTH0_MANAGEMENT_CLIENT_SECRET: string;

  @IsString()
  @IsOptional()
  S3_ENDPOINT: string;

  @IsString()
  @IsOptional()
  S3_REGION: string;

  @IsString()
  @IsOptional()
  S3_BUCKET: string;

  @IsString()
  @IsOptional()
  S3_ACCESS_KEY: string;

  @IsString()
  @IsOptional()
  S3_SECRET_KEY: string;

  @IsString()
  @IsOptional()
  STRIPE_SECRET_KEY: string;

  @IsString()
  @IsOptional()
  STRIPE_WEBHOOK_SECRET: string;

  @IsNumber()
  @IsOptional()
  FREE_MAX_PROJECTS: number = 3;

  @IsNumber()
  @IsOptional()
  FREE_MAX_SHARES_PER_PROJECT: number = 3;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
